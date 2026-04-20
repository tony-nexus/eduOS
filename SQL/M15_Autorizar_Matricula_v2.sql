-- ============================================================
-- Migration M15 — autorizar_matricula v2 + fn_auto_enroll com conflito de datas
-- HLV EduOS · Server-side enforcement de regras de matrícula
-- ============================================================
--
-- O que faz:
--   1. Helper: fn_datas_conflitam(inicio1, fim1, inicio2, fim2) BOOLEAN
--   2. RPC atualizada: autorizar_matricula(aluno_id, curso_id, turma_id DEFAULT NULL)
--      → bloqueia matrícula se aluno já tem turma ativa com conflito de datas
--      → bloqueia matrícula se turma candidata está em_andamento
--   3. Trigger atualizado: fn_auto_enroll_aguardando
--      → verifica conflito de datas antes de enrolar cada aluno em espera
--
-- Pré-requisitos:
--   - M14_Full_Automation.sql já executado
--
-- Execute no Supabase SQL Editor (painel de produção).
-- ============================================================


-- ── 1. HELPER: Detecta sobreposição entre dois períodos ─────

CREATE OR REPLACE FUNCTION public.fn_datas_conflitam(
  p_inicio1 DATE,
  p_fim1    DATE,
  p_inicio2 DATE,
  p_fim2    DATE
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  -- NULL em p_inicio = sem data definida → sem conflito detectável
  -- NULL em p_fim    = vigência infinita → COALESCE para 2099
  SELECT CASE
    WHEN p_inicio1 IS NULL OR p_inicio2 IS NULL THEN FALSE
    ELSE
      p_inicio1 <= COALESCE(p_fim2, '2099-12-31'::DATE)
      AND
      p_inicio2 <= COALESCE(p_fim1, '2099-12-31'::DATE)
  END;
$$;


-- ── 2. RPC: autorizar_matricula v2 ──────────────────────────
--
-- Parâmetros:
--   p_aluno_id  UUID           — aluno a matricular
--   p_curso_id  UUID           — curso pretendido
--   p_turma_id  UUID DEFAULT NULL — turma específica (opcional)
--
-- Retorna JSONB:
--   { "autorizado": true,  "tipo_matricula": "Nova Matrícula" | "Renovação/Reciclagem" }
--   { "autorizado": false, "motivo": "..." }

CREATE OR REPLACE FUNCTION public.autorizar_matricula(
  p_aluno_id UUID,
  p_curso_id UUID,
  p_turma_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_matricula_ativa BOOLEAN;
  v_cert_valido     BOOLEAN;
  v_cert_vencido    BOOLEAN;
  v_tipo            VARCHAR := 'Nova Matrícula';
  v_turma_status    VARCHAR;
  v_turma_inicio    DATE;
  v_turma_fim       DATE;
  v_conflito        RECORD;
BEGIN

  -- ── Bloco 1: Matrícula ativa no mesmo curso ────────────────
  SELECT EXISTS (
    SELECT 1 FROM public.matriculas
    WHERE aluno_id = p_aluno_id
      AND curso_id = p_curso_id
      AND status IN ('matriculado', 'aguardando_turma', 'em_andamento')
  ) INTO v_matricula_ativa;

  IF v_matricula_ativa THEN
    RETURN jsonb_build_object(
      'autorizado', false,
      'motivo', 'Aluno já possui matrícula ativa neste curso.'
    );
  END IF;

  -- ── Bloco 2: Certificado válido (não precisa renovar) ──────
  SELECT EXISTS (
    SELECT 1 FROM public.certificados
    WHERE aluno_id = p_aluno_id
      AND curso_id = p_curso_id
      AND status = 'valido'
  ) INTO v_cert_valido;

  IF v_cert_valido THEN
    RETURN jsonb_build_object(
      'autorizado', false,
      'motivo', 'Aluno já possui certificado válido para este curso.'
    );
  END IF;

  -- ── Bloco 3: Verificações específicas da turma (se fornecida) ──

  IF p_turma_id IS NOT NULL THEN

    -- 3a. Turma existe e está agendada (em_andamento bloqueada)
    SELECT status, data_inicio, data_fim
    INTO v_turma_status, v_turma_inicio, v_turma_fim
    FROM public.turmas
    WHERE id = p_turma_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'autorizado', false,
        'motivo', 'Turma não encontrada.'
      );
    END IF;

    IF v_turma_status = 'em_andamento' THEN
      RETURN jsonb_build_object(
        'autorizado', false,
        'motivo', 'Turma já está em andamento. Aguarde a próxima turma agendada.'
      );
    END IF;

    IF v_turma_status NOT IN ('agendada') THEN
      RETURN jsonb_build_object(
        'autorizado', false,
        'motivo', 'Turma não está disponível para novas matrículas (status: ' || v_turma_status || ').'
      );
    END IF;

    -- 3b. Conflito de datas com turmas ativas do aluno
    IF v_turma_inicio IS NOT NULL THEN
      SELECT
        t.codigo,
        t.data_inicio,
        t.data_fim
      INTO v_conflito
      FROM public.matriculas m
      JOIN public.turmas t ON t.id = m.turma_id
      WHERE m.aluno_id  = p_aluno_id
        AND m.status    IN ('matriculado', 'em_andamento')
        AND m.turma_id  IS NOT NULL
        AND m.turma_id  <> p_turma_id
        AND public.fn_datas_conflitam(
              v_turma_inicio, v_turma_fim,
              t.data_inicio,  t.data_fim
            )
      LIMIT 1;

      IF FOUND THEN
        RETURN jsonb_build_object(
          'autorizado', false,
          'motivo', 'Conflito de datas com turma ' || v_conflito.codigo ||
                    ' (' || v_conflito.data_inicio || ' a ' ||
                    COALESCE(v_conflito.data_fim::TEXT, 'sem data fim') || ').'
        );
      END IF;
    END IF;

  END IF;

  -- ── Bloco 4: Detecta se é renovação (cert vencido) ────────
  SELECT EXISTS (
    SELECT 1 FROM public.certificados
    WHERE aluno_id = p_aluno_id
      AND curso_id = p_curso_id
      AND status = 'vencido'
  ) INTO v_cert_vencido;

  IF v_cert_vencido THEN
    v_tipo := 'Renovação/Reciclagem';
  END IF;

  RETURN jsonb_build_object('autorizado', true, 'tipo_matricula', v_tipo);

END;
$$;


-- ── 3. TRIGGER: fn_auto_enroll_aguardando com conflito de datas ─

CREATE OR REPLACE FUNCTION public.fn_auto_enroll_aguardando()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  m                 RECORD;
  vagas_disponiveis INTEGER;
  v_conflito_id     UUID;
BEGIN
  -- Só age em turmas agendadas com vagas
  IF NEW.status <> 'agendada' THEN
    RETURN NEW;
  END IF;

  vagas_disponiveis := COALESCE(NEW.vagas, 0) - COALESCE(NEW.ocupadas, 0);
  IF vagas_disponiveis <= 0 THEN
    RETURN NEW;
  END IF;

  -- FIFO: busca alunos em espera para este curso
  FOR m IN
    SELECT id, aluno_id
    FROM public.matriculas
    WHERE tenant_id = NEW.tenant_id
      AND curso_id  = NEW.curso_id
      AND status    = 'aguardando_turma'
      AND turma_id  IS NULL
    ORDER BY created_at ASC
    LIMIT vagas_disponiveis
  LOOP

    -- Verifica conflito de datas com turmas ativas do aluno
    IF NEW.data_inicio IS NOT NULL THEN
      SELECT t.id
      INTO v_conflito_id
      FROM public.matriculas ma
      JOIN public.turmas t ON t.id = ma.turma_id
      WHERE ma.aluno_id  = m.aluno_id
        AND ma.status    IN ('matriculado', 'em_andamento')
        AND ma.turma_id  IS NOT NULL
        AND public.fn_datas_conflitam(
              NEW.data_inicio, NEW.data_fim,
              t.data_inicio,   t.data_fim
            )
      LIMIT 1;

      -- Conflito encontrado: mantém em aguardando_turma, não vincula
      IF FOUND THEN
        CONTINUE;
      END IF;
    END IF;

    -- Sem conflito: vincula à nova turma
    UPDATE public.matriculas
    SET turma_id = NEW.id,
        status   = 'matriculado'
    WHERE id = m.id;

    vagas_disponiveis := vagas_disponiveis - 1;
    IF vagas_disponiveis <= 0 THEN
      EXIT;
    END IF;

  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_turma_insert_enroll ON public.turmas;

CREATE TRIGGER trg_turma_insert_enroll
AFTER INSERT ON public.turmas
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_enroll_aguardando();


-- ── 4. Atualiza débito técnico: RPC agora bloqueia em_andamento ─

-- (nenhum DDL necessário, apenas registro)
-- debitos-tecnicos.md → item "autorizar_matricula RPC" → resolvido nesta migration


-- ── 5. Verificação pós-migration ────────────────────────────

-- Testa helper de datas (deve retornar t, t, f)
DO $$
BEGIN
  -- Sobreposição direta
  ASSERT public.fn_datas_conflitam('2026-01-01', '2026-03-31', '2026-02-01', '2026-04-30') = TRUE,
    'fn_datas_conflitam: falhou em sobreposição direta';

  -- Sobreposição via fim nulo (vigência infinita)
  ASSERT public.fn_datas_conflitam('2026-01-01', NULL, '2026-06-01', '2026-08-31') = TRUE,
    'fn_datas_conflitam: falhou com fim nulo';

  -- Sem sobreposição
  ASSERT public.fn_datas_conflitam('2026-01-01', '2026-03-31', '2026-04-01', '2026-06-30') = FALSE,
    'fn_datas_conflitam: falhou sem sobreposição';

  RAISE NOTICE 'M15: fn_datas_conflitam OK';
END;
$$;

-- Confirma assinatura da RPC
SELECT
  p.proname,
  pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'autorizar_matricula';

-- ============================================================
-- FIM M15
-- ============================================================
