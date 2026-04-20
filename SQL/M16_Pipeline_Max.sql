-- ============================================================
-- Migration M16 — Pipeline Máxima Autonomia
-- HLV EduOS · Zero interação humana no ciclo de vida completo
-- ============================================================
--
-- O que faz:
--   1. Trigger: vaga liberada (cancelamento) → enrola próximo da fila
--   2. Trigger: nova matrícula → cria cobrança automática
--   3. Trigger: turma vinculada tardiamente → corrige data de vencimento
--   4. Função + cron 00:01: envelhece certificados (valido→a_vencer→vencido)
--   5. Função + cron 00:35: cria matrículas de renovação para a_vencer
--   6. Reconfigura todos os cron jobs em ordem correta
--
-- Pré-requisitos:
--   - M15_Autorizar_Matricula_v2.sql já executado (fn_datas_conflitam disponível)
--   - pg_cron habilitado
--
-- Execute no Supabase SQL Editor (painel de produção).
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- 1. TRIGGER: Vaga liberada → enrola próximo da fila
-- ══════════════════════════════════════════════════════════════
-- Quando uma matrícula é cancelada e tinha turma vinculada,
-- procura o próximo aluno em aguardando_turma (FIFO) sem
-- conflito de datas e o enrola.

CREATE OR REPLACE FUNCTION public.fn_vaga_liberada()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_turma   RECORD;
  m         RECORD;
BEGIN
  -- Só age quando cancela uma matrícula que tinha turma
  IF NEW.status <> 'cancelado' OR OLD.status = 'cancelado' THEN
    RETURN NEW;
  END IF;
  IF NEW.turma_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Carrega turma liberada
  SELECT id, curso_id, tenant_id, data_inicio, data_fim, status, vagas, ocupadas
  INTO v_turma
  FROM public.turmas
  WHERE id = NEW.turma_id;

  -- Só reenrola se turma ainda está agendada
  IF v_turma.status <> 'agendada' THEN
    RETURN NEW;
  END IF;

  -- FIFO: testa até 10 candidatos (pula os com conflito)
  FOR m IN
    SELECT id, aluno_id
    FROM public.matriculas
    WHERE tenant_id = NEW.tenant_id
      AND curso_id  = v_turma.curso_id
      AND status    = 'aguardando_turma'
      AND turma_id  IS NULL
    ORDER BY created_at ASC
    LIMIT 10
  LOOP
    -- Verificação de conflito de datas
    IF v_turma.data_inicio IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.matriculas ma
        JOIN public.turmas t ON t.id = ma.turma_id
        WHERE ma.aluno_id = m.aluno_id
          AND ma.status   IN ('matriculado', 'em_andamento')
          AND ma.turma_id IS NOT NULL
          AND public.fn_datas_conflitam(
                v_turma.data_inicio, v_turma.data_fim,
                t.data_inicio,       t.data_fim
              )
      ) THEN
        CONTINUE; -- conflito: próximo candidato
      END IF;
    END IF;

    -- Sem conflito: vincula e sai
    UPDATE public.matriculas
    SET turma_id = v_turma.id,
        status   = 'matriculado'
    WHERE id = m.id;

    EXIT;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vaga_liberada ON public.matriculas;

CREATE TRIGGER trg_vaga_liberada
AFTER UPDATE OF status ON public.matriculas
FOR EACH ROW
WHEN (NEW.status = 'cancelado' AND OLD.status <> 'cancelado')
EXECUTE FUNCTION public.fn_vaga_liberada();


-- ══════════════════════════════════════════════════════════════
-- 2. TRIGGER: Nova matrícula → cria cobrança automática
-- ══════════════════════════════════════════════════════════════
-- Ao inserir matrícula com curso que tem valor_padrao > 0,
-- gera automaticamente um registro em pagamentos com status
-- 'pendente'. Data de vencimento = data_inicio da turma (se
-- houver turma) ou hoje + 30 dias.

CREATE OR REPLACE FUNCTION public.fn_cria_pagamento()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_valor      DECIMAL(10,2);
  v_vencimento DATE;
BEGIN
  -- Não gera cobrança para matrículas já canceladas
  IF NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- Valor do curso
  SELECT valor_padrao INTO v_valor
  FROM public.cursos
  WHERE id = NEW.curso_id;

  -- Curso gratuito ou sem valor definido: não gera cobrança
  IF COALESCE(v_valor, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Vencimento = data_inicio da turma ou +30 dias
  IF NEW.turma_id IS NOT NULL THEN
    SELECT data_inicio INTO v_vencimento
    FROM public.turmas
    WHERE id = NEW.turma_id;
  END IF;

  v_vencimento := COALESCE(v_vencimento, CURRENT_DATE + INTERVAL '30 days');

  INSERT INTO public.pagamentos (
    tenant_id, matricula_id, aluno_id, curso_id,
    valor, data_vencimento, status
  ) VALUES (
    NEW.tenant_id, NEW.id, NEW.aluno_id, NEW.curso_id,
    v_valor, v_vencimento, 'pendente'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matricula_cria_pagamento ON public.matriculas;

CREATE TRIGGER trg_matricula_cria_pagamento
AFTER INSERT ON public.matriculas
FOR EACH ROW
EXECUTE FUNCTION public.fn_cria_pagamento();


-- ══════════════════════════════════════════════════════════════
-- 3. TRIGGER: Turma vinculada tardiamente → ajusta vencimento
-- ══════════════════════════════════════════════════════════════
-- Quando um aluno em aguardando_turma recebe uma turma via
-- auto-enroll, corrige a data de vencimento do pagamento
-- pendente para coincidir com data_inicio da turma.

CREATE OR REPLACE FUNCTION public.fn_atualiza_vencimento_pagamento()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_data_inicio DATE;
BEGIN
  -- Só age quando turma_id passa de NULL para um valor
  IF OLD.turma_id IS NOT NULL OR NEW.turma_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT data_inicio INTO v_data_inicio
  FROM public.turmas
  WHERE id = NEW.turma_id;

  IF v_data_inicio IS NOT NULL THEN
    UPDATE public.pagamentos
    SET data_vencimento = v_data_inicio
    WHERE matricula_id = NEW.id
      AND status       = 'pendente';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matricula_ajusta_vencimento ON public.matriculas;

CREATE TRIGGER trg_matricula_ajusta_vencimento
AFTER UPDATE OF turma_id ON public.matriculas
FOR EACH ROW
WHEN (OLD.turma_id IS NULL AND NEW.turma_id IS NOT NULL)
EXECUTE FUNCTION public.fn_atualiza_vencimento_pagamento();


-- ══════════════════════════════════════════════════════════════
-- 4. FUNÇÃO: Envelhece certificados por data
-- ══════════════════════════════════════════════════════════════
-- Roda às 00:01 UTC antes de qualquer outro job.
--   valido      → a_vencer  (vence em até 30 dias)
--   valido/a_vencer → vencido (data_validade já passou)
-- Retorna número de certs marcados como vencido.

CREATE OR REPLACE FUNCTION public.fn_mark_certs_status()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE total INTEGER := 0;
BEGIN
  -- Prioridade: vencidos primeiro (evita marcar a_vencer e já vencer no mesmo dia)
  UPDATE public.certificados
  SET status = 'vencido'
  WHERE status        IN ('valido', 'a_vencer')
    AND data_validade IS NOT NULL
    AND data_validade  < CURRENT_DATE;
  GET DIAGNOSTICS total = ROW_COUNT;

  -- valido → a_vencer (30 dias de antecedência)
  UPDATE public.certificados
  SET status = 'a_vencer'
  WHERE status        = 'valido'
    AND data_validade IS NOT NULL
    AND data_validade >= CURRENT_DATE
    AND data_validade <= CURRENT_DATE + INTERVAL '30 days';

  RETURN total;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- 5. FUNÇÃO: Auto-cria matrículas de renovação
-- ══════════════════════════════════════════════════════════════
-- Para cada certificado a_vencer sem matrícula ativa no curso,
-- cria matrícula com aguardando_turma. O trigger
-- trg_turma_insert_enroll (M15) vincula à turma disponível
-- automaticamente quando uma nova turma for criada.
-- Retorna número de renovações criadas.

CREATE OR REPLACE FUNCTION public.fn_auto_renovacao()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  c     RECORD;
  total INTEGER := 0;
BEGIN
  FOR c IN
    SELECT DISTINCT ON (aluno_id, curso_id)
      aluno_id, curso_id, tenant_id
    FROM public.certificados
    WHERE status = 'a_vencer'
    ORDER BY aluno_id, curso_id, data_validade ASC
  LOOP
    -- Pula se já tem matrícula ativa
    IF EXISTS (
      SELECT 1 FROM public.matriculas
      WHERE aluno_id = c.aluno_id
        AND curso_id = c.curso_id
        AND status   IN ('matriculado', 'aguardando_turma', 'em_andamento')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.matriculas (
      tenant_id, aluno_id, curso_id, status, observacoes
    ) VALUES (
      c.tenant_id, c.aluno_id, c.curso_id,
      'aguardando_turma', 'Renovação automática — certificado a vencer'
    );

    total := total + 1;
  END LOOP;

  RETURN total;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- 6. pg_cron: reconfiguração completa (idempotente)
-- ══════════════════════════════════════════════════════════════
-- Execute MANUALMENTE no SQL Editor após confirmar pg_cron ativo.
-- Verificar: SELECT * FROM cron.job;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'hlv-sync-turmas',
  'hlv-emit-certs',
  'hlv-mark-certs',
  'hlv-auto-renovacao',
  'hlv-pagamentos-atraso'
);

-- 00:01 — envelhece certificados (antes de emitir novos)
SELECT cron.schedule(
  'hlv-mark-certs',
  '1 0 * * *',
  'SELECT public.fn_mark_certs_status()'
);

-- 00:05 — avança turmas por data (trigger propaga para matrículas)
SELECT cron.schedule(
  'hlv-sync-turmas',
  '5 0 * * *',
  'SELECT public.fn_sync_turmas_por_data()'
);

-- 00:10 — marca pagamentos atrasados
SELECT cron.schedule(
  'hlv-pagamentos-atraso',
  '10 0 * * *',
  'SELECT public.fn_mark_pagamentos_atrasados()'
);

-- 00:30 — emite certificados para matrículas concluídas
SELECT cron.schedule(
  'hlv-emit-certs',
  '30 0 * * *',
  'SELECT public.fn_auto_emit_certificados()'
);

-- 00:35 — cria renovações para certificados a_vencer
SELECT cron.schedule(
  'hlv-auto-renovacao',
  '35 0 * * *',
  'SELECT public.fn_auto_renovacao()'
);


-- ══════════════════════════════════════════════════════════════
-- 7. Verificação pós-migration
-- ══════════════════════════════════════════════════════════════

-- Confirma triggers criados:
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name IN (
  'trg_vaga_liberada',
  'trg_matricula_cria_pagamento',
  'trg_matricula_ajusta_vencimento'
)
ORDER BY trigger_name;

-- Confirma cron jobs agendados (espera 5 linhas):
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname LIKE 'hlv-%'
ORDER BY schedule;

-- ============================================================
-- FIM M16
-- ============================================================
