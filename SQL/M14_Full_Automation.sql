-- ============================================================
-- Migration M14 — Pipeline 100% Autônomo
-- HLV EduOS · Automações completas no banco de dados
-- ============================================================
--
-- O que faz:
--   1. Trigger: quando turma muda de status → propaga para matrículas
--   2. Trigger: quando nova turma é criada → enrola alunos em espera
--   3. Função + cron: avança turmas por data diariamente (00:05 UTC)
--   4. Função + cron: emite certificados automaticamente (00:30 UTC)
--
-- Após esta migration, o pipeline atualiza sem nenhuma intervenção humana.
-- O frontend (automations.js) passa a ser apenas fallback/botão manual.
--
-- Pré-requisitos:
--   - pg_cron habilitado: Dashboard > Database > Extensions > pg_cron
--   - M13_Business_Constraints.sql já executado
--
-- Execute no Supabase SQL Editor (painel de produção).
-- ============================================================


-- ── 1. TRIGGER: Propaga status da turma para matrículas ──────

CREATE OR REPLACE FUNCTION public.fn_sync_matriculas_from_turma()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- agendada → em_andamento: avança matrículas ativas da turma
  IF NEW.status = 'em_andamento' AND OLD.status = 'agendada' THEN
    UPDATE public.matriculas
    SET status = 'em_andamento'
    WHERE turma_id = NEW.id
      AND tenant_id = NEW.tenant_id
      AND status IN ('matriculado', 'aguardando_turma');
  END IF;

  -- em_andamento → concluida: avança matrículas em andamento para concluido
  IF NEW.status = 'concluida' AND OLD.status = 'em_andamento' THEN
    UPDATE public.matriculas
    SET status = 'concluido'
    WHERE turma_id = NEW.id
      AND tenant_id = NEW.tenant_id
      AND status = 'em_andamento';
  END IF;

  -- cancelada: cancela todas as matrículas ativas da turma
  IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN
    UPDATE public.matriculas
    SET status = 'cancelado'
    WHERE turma_id = NEW.id
      AND tenant_id = NEW.tenant_id
      AND status IN ('matriculado', 'aguardando_turma', 'em_andamento');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_turma_status_change ON public.turmas;

CREATE TRIGGER trg_turma_status_change
AFTER UPDATE OF status ON public.turmas
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.fn_sync_matriculas_from_turma();


-- ── 2. TRIGGER: Auto-enrola alunos em espera ao criar turma ─

CREATE OR REPLACE FUNCTION public.fn_auto_enroll_aguardando()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  m RECORD;
  vagas_disponiveis INTEGER;
BEGIN
  -- Só age em turmas agendadas ou em andamento com vagas
  IF NEW.status NOT IN ('agendada', 'em_andamento') THEN
    RETURN NEW;
  END IF;

  vagas_disponiveis := COALESCE(NEW.vagas, 0) - COALESCE(NEW.ocupadas, 0);
  IF vagas_disponiveis <= 0 THEN
    RETURN NEW;
  END IF;

  -- Enrola alunos aguardando turma neste curso (FIFO por created_at)
  FOR m IN
    SELECT id
    FROM public.matriculas
    WHERE tenant_id  = NEW.tenant_id
      AND curso_id   = NEW.curso_id
      AND status     = 'aguardando_turma'
      AND turma_id   IS NULL
    ORDER BY created_at ASC
    LIMIT vagas_disponiveis
  LOOP
    UPDATE public.matriculas
    SET turma_id = NEW.id,
        status   = 'matriculado'
    WHERE id = m.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_turma_insert_enroll ON public.turmas;

CREATE TRIGGER trg_turma_insert_enroll
AFTER INSERT ON public.turmas
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_enroll_aguardando();


-- ── 3. FUNÇÃO: Avança turmas por data ────────────────────────
-- Chamada pelo pg_cron diariamente.
-- Retorna número de turmas avançadas.

CREATE OR REPLACE FUNCTION public.fn_sync_turmas_por_data()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  total INTEGER := 0;
  r     RECORD;
BEGIN
  -- agendada → em_andamento (data_inicio <= hoje)
  FOR r IN
    UPDATE public.turmas
    SET status = 'em_andamento'
    WHERE status     = 'agendada'
      AND data_inicio <= CURRENT_DATE
    RETURNING id
  LOOP
    total := total + 1;
  END LOOP;

  -- em_andamento → concluida (data_fim <= hoje, data_fim preenchida)
  FOR r IN
    UPDATE public.turmas
    SET status = 'concluida'
    WHERE status   = 'em_andamento'
      AND data_fim IS NOT NULL
      AND data_fim <= CURRENT_DATE
    RETURNING id
  LOOP
    total := total + 1;
  END LOOP;

  RETURN total;
END;
$$;

-- Nota: o trigger trg_turma_status_change propaga automaticamente
-- para as matrículas quando turmas.status é atualizado aqui.


-- ── 4. FUNÇÃO: Emite certificados automaticamente ────────────
-- Para cada matrícula 'concluido' sem pendências:
--   - sem cert válido/a_vencer já emitido
--   - sem pagamentos pendente/atraso
-- → insere certificado + avança matrícula para 'certificado_emitido'
-- Retorna número de certificados emitidos.

CREATE OR REPLACE FUNCTION public.fn_auto_emit_certificados()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  m              RECORD;
  v_cert_existe  INTEGER;
  v_pag_aberto   INTEGER;
  v_meses        INTEGER;
  v_validade     DATE;
  v_codigo       TEXT;
  total          INTEGER := 0;
BEGIN
  FOR m IN
    SELECT mat.id AS mat_id,
           mat.aluno_id,
           mat.curso_id,
           mat.tenant_id,
           cur.validade_meses
    FROM public.matriculas mat
    JOIN public.cursos cur ON cur.id = mat.curso_id
    WHERE mat.status = 'concluido'
    LIMIT 100
  LOOP
    -- Já tem certificado válido ou a_vencer?
    SELECT COUNT(*) INTO v_cert_existe
    FROM public.certificados
    WHERE tenant_id = m.tenant_id
      AND aluno_id  = m.aluno_id
      AND curso_id  = m.curso_id
      AND status   IN ('valido', 'a_vencer');

    IF v_cert_existe > 0 THEN CONTINUE; END IF;

    -- Tem pagamentos em aberto?
    SELECT COUNT(*) INTO v_pag_aberto
    FROM public.pagamentos
    WHERE tenant_id   = m.tenant_id
      AND matricula_id = m.mat_id
      AND status      IN ('pendente', 'atraso');

    IF v_pag_aberto > 0 THEN CONTINUE; END IF;

    -- Calcula data de validade
    v_meses   := m.validade_meses;
    v_validade := NULL;
    IF v_meses IS NOT NULL THEN
      v_validade := CURRENT_DATE + (v_meses || ' months')::INTERVAL;
    END IF;

    -- Gera código único de verificação
    v_codigo := 'CRT-'
      || upper(substring(md5(random()::text) FROM 1 FOR 6))
      || '-'
      || upper(to_hex(extract(epoch FROM now())::bigint));

    -- Insere certificado
    INSERT INTO public.certificados (
      tenant_id, aluno_id, curso_id, matricula_id,
      data_emissao, data_validade, status, codigo_verificacao
    ) VALUES (
      m.tenant_id, m.aluno_id, m.curso_id, m.mat_id,
      CURRENT_DATE, v_validade, 'valido', v_codigo
    )
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      -- Avança pipeline
      UPDATE public.matriculas
      SET status = 'certificado_emitido'
      WHERE id = m.mat_id;

      total := total + 1;
    END IF;
  END LOOP;

  RETURN total;
END;
$$;


-- ── 5. pg_cron: agendamentos diários ─────────────────────────
-- Execute MANUALMENTE no SQL Editor após confirmar que pg_cron está ativo.
-- Verificar: SELECT * FROM cron.job;

-- Remove agendamentos anteriores (idempotente)
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN ('hlv-sync-turmas', 'hlv-emit-certs');

-- 00:05 UTC — avança turmas por data (propagação via trigger automática)
SELECT cron.schedule(
  'hlv-sync-turmas',
  '5 0 * * *',
  'SELECT public.fn_sync_turmas_por_data()'
);

-- 00:30 UTC — emite certificados pendentes
SELECT cron.schedule(
  'hlv-emit-certs',
  '30 0 * * *',
  'SELECT public.fn_auto_emit_certificados()'
);


-- ── 6. Verificação pós-migration ─────────────────────────────

-- Confirma triggers criados:
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name IN ('trg_turma_status_change', 'trg_turma_insert_enroll')
ORDER BY trigger_name;

-- Confirma cron jobs agendados:
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname IN ('hlv-sync-turmas', 'hlv-emit-certs', 'mark-pagamentos-atrasados')
ORDER BY jobname;

-- Resultado esperado: 2 triggers + 2 novos cron jobs listados.

-- ── 7. Teste manual (opcional) ───────────────────────────────
-- Execute para forçar uma rodada completa de automação:
--
--   SELECT public.fn_sync_turmas_por_data()   AS turmas_avancadas;
--   SELECT public.fn_auto_emit_certificados() AS certs_emitidos;
