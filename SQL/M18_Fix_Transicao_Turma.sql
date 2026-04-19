-- ============================================================
-- Migration M18 — Fix: transição direta de turma e conflito de datas
-- HLV EduOS
-- ============================================================
--
-- Problema raiz:
--   fn_sync_matriculas_from_turma só cobria em_andamento → concluida.
--   Se a turma pulava agendada → concluida (ou qualquer → cancelada)
--   diretamente, as matrículas ficavam presas em 'matriculado' e
--   continuavam bloqueando novas matrículas no guard de conflito de datas.
--
-- O que esta migration corrige:
--   1. fn_sync_matriculas_from_turma — cobre TODAS as transições para
--      concluida e cancelada, independente do status anterior.
--   2. autorizar_matricula — JOIN com turmas para excluir turmas
--      concluidas/canceladas do check de conflito de datas.
--   3. fn_auto_enroll_aguardando — mesma proteção no trigger de FIFO.
--
-- Execute no Supabase SQL Editor.
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- 1. TRIGGER fn_sync_matriculas_from_turma (corrigido)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_sync_matriculas_from_turma()
RETURNS TRIGGER LANGUAGE plpgsql AS $sync_turma$
BEGIN

  -- agendada → em_andamento: avança matrículas ativas
  IF NEW.status = 'em_andamento' AND OLD.status = 'agendada' THEN
    UPDATE public.matriculas
    SET status = 'em_andamento'
    WHERE turma_id  = NEW.id
      AND tenant_id = NEW.tenant_id
      AND status    IN ('matriculado', 'aguardando_turma');
  END IF;

  -- QUALQUER → concluida: avança todas as matrículas ativas da turma
  IF NEW.status = 'concluida' AND OLD.status <> 'concluida' THEN
    UPDATE public.matriculas
    SET status = 'concluido'
    WHERE turma_id  = NEW.id
      AND tenant_id = NEW.tenant_id
      AND status    IN ('matriculado', 'aguardando_turma', 'em_andamento');
  END IF;

  -- QUALQUER → cancelada: cancela todas as matrículas ativas
  IF NEW.status = 'cancelada' AND OLD.status <> 'cancelada' THEN
    UPDATE public.matriculas
    SET status = 'cancelado'
    WHERE turma_id  = NEW.id
      AND tenant_id = NEW.tenant_id
      AND status    IN ('matriculado', 'aguardando_turma', 'em_andamento');
  END IF;

  RETURN NEW;
END;
$sync_turma$;

-- Trigger já existe (M14), apenas a função foi atualizada acima.


-- ══════════════════════════════════════════════════════════════
-- 2. autorizar_matricula — exclui turmas encerradas do conflito
-- ══════════════════════════════════════════════════════════════

-- DROP garante que uma versão antiga com LANGUAGE diferente não bloqueie o REPLACE
DROP FUNCTION IF EXISTS public.autorizar_matricula(UUID, UUID, UUID);

CREATE FUNCTION public.autorizar_matricula(
  p_aluno_id UUID,
  p_curso_id UUID,
  p_turma_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $auth_mat$
BEGIN
  -- 1. Matricula ativa no mesmo curso
  IF EXISTS (
    SELECT 1 FROM public.matriculas
    WHERE aluno_id = p_aluno_id
      AND curso_id = p_curso_id
      AND status   IN ('matriculado', 'aguardando_turma', 'em_andamento')
  ) THEN
    RETURN jsonb_build_object('autorizado', false, 'motivo', 'Aluno ja possui matricula ativa neste curso.');
  END IF;

  -- 2. Certificado valido
  IF EXISTS (
    SELECT 1 FROM public.certificados
    WHERE aluno_id = p_aluno_id
      AND curso_id = p_curso_id
      AND status   = 'valido'
  ) THEN
    RETURN jsonb_build_object('autorizado', false, 'motivo', 'Aluno ja possui certificado valido para este curso.');
  END IF;

  -- 3. Verificacoes da turma especifica
  IF p_turma_id IS NOT NULL THEN

    IF NOT EXISTS (SELECT 1 FROM public.turmas WHERE id = p_turma_id) THEN
      RETURN jsonb_build_object('autorizado', false, 'motivo', 'Turma nao encontrada.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.turmas WHERE id = p_turma_id AND status = 'em_andamento') THEN
      RETURN jsonb_build_object('autorizado', false, 'motivo', 'Turma ja esta em andamento. Aguarde a proxima turma agendada.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.turmas WHERE id = p_turma_id AND status = 'agendada') THEN
      RETURN jsonb_build_object(
        'autorizado', false,
        'motivo', 'Turma nao esta disponivel (status: ' ||
                  (SELECT status FROM public.turmas WHERE id = p_turma_id) || ').'
      );
    END IF;

    -- 4. Conflito de datas (exclui turmas encerradas)
    IF EXISTS (
      SELECT 1
      FROM public.matriculas ma
      JOIN public.turmas t     ON t.id    = ma.turma_id
      JOIN public.turmas nova  ON nova.id = p_turma_id
      WHERE ma.aluno_id  = p_aluno_id
        AND ma.status    IN ('matriculado', 'em_andamento')
        AND ma.turma_id  IS NOT NULL
        AND ma.turma_id  <> p_turma_id
        AND t.status     NOT IN ('concluida', 'cancelada')
        AND nova.data_inicio IS NOT NULL
        AND public.fn_datas_conflitam(nova.data_inicio, nova.data_fim, t.data_inicio, t.data_fim)
    ) THEN
      RETURN (
        SELECT jsonb_build_object(
          'autorizado', false,
          'motivo', 'Conflito de datas com turma ' || t.codigo ||
                    ' (' || t.data_inicio || ' a ' ||
                    COALESCE(t.data_fim::TEXT, 'sem fim') || ').'
        )
        FROM public.matriculas ma
        JOIN public.turmas t     ON t.id    = ma.turma_id
        JOIN public.turmas nova  ON nova.id = p_turma_id
        WHERE ma.aluno_id  = p_aluno_id
          AND ma.status    IN ('matriculado', 'em_andamento')
          AND ma.turma_id  IS NOT NULL
          AND ma.turma_id  <> p_turma_id
          AND t.status     NOT IN ('concluida', 'cancelada')
          AND nova.data_inicio IS NOT NULL
          AND public.fn_datas_conflitam(nova.data_inicio, nova.data_fim, t.data_inicio, t.data_fim)
        LIMIT 1
      );
    END IF;

  END IF;

  -- 5. Tipo: renovacao ou nova matricula
  IF EXISTS (
    SELECT 1 FROM public.certificados
    WHERE aluno_id = p_aluno_id
      AND curso_id = p_curso_id
      AND status   = 'vencido'
  ) THEN
    RETURN jsonb_build_object('autorizado', true, 'tipo_matricula', 'Renovacao/Reciclagem');
  END IF;

  RETURN jsonb_build_object('autorizado', true, 'tipo_matricula', 'Nova Matricula');
END;
$auth_mat$;


-- ══════════════════════════════════════════════════════════════
-- 3. fn_auto_enroll_aguardando — mesma proteção no FIFO
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_auto_enroll_aguardando()
RETURNS TRIGGER LANGUAGE plpgsql AS $auto_enroll$
BEGIN
  IF NEW.status <> 'agendada' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.vagas, 0) - COALESCE(NEW.ocupadas, 0) <= 0 THEN RETURN NEW; END IF;

  UPDATE public.matriculas
  SET turma_id = NEW.id,
      status   = 'matriculado'
  WHERE id IN (
    SELECT ma.id
    FROM public.matriculas ma
    WHERE ma.tenant_id = NEW.tenant_id
      AND ma.curso_id  = NEW.curso_id
      AND ma.status    = 'aguardando_turma'
      AND ma.turma_id  IS NULL
      AND (
        NEW.data_inicio IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.matriculas ma2
          JOIN public.turmas t ON t.id = ma2.turma_id
          WHERE ma2.aluno_id = ma.aluno_id
            AND ma2.status   IN ('matriculado', 'em_andamento')
            AND ma2.turma_id IS NOT NULL
            AND t.status     NOT IN ('concluida', 'cancelada')
            AND public.fn_datas_conflitam(
                  NEW.data_inicio, NEW.data_fim,
                  t.data_inicio,   t.data_fim
                )
        )
      )
    ORDER BY ma.created_at ASC
    LIMIT COALESCE(NEW.vagas, 0) - COALESCE(NEW.ocupadas, 0)
  );

  RETURN NEW;
END;
$auto_enroll$;

-- Triggers já existem (M14/M15), apenas as funções foram atualizadas.


-- ══════════════════════════════════════════════════════════════
-- 4. Backfill: corrige matrículas presas em turmas encerradas
-- ══════════════════════════════════════════════════════════════

-- Turmas concluídas → matrículas presas vão para 'concluido'
UPDATE public.matriculas m
SET status = 'concluido'
FROM public.turmas t
WHERE m.turma_id  = t.id
  AND t.status    = 'concluida'
  AND m.status    IN ('matriculado', 'aguardando_turma', 'em_andamento');

-- Turmas canceladas → matrículas presas vão para 'cancelado'
UPDATE public.matriculas m
SET status = 'cancelado'
FROM public.turmas t
WHERE m.turma_id  = t.id
  AND t.status    = 'cancelada'
  AND m.status    IN ('matriculado', 'aguardando_turma', 'em_andamento');

-- Confirma resultado
SELECT
  t.status  AS turma_status,
  m.status  AS matricula_status,
  COUNT(*)  AS total
FROM public.matriculas m
JOIN public.turmas t ON t.id = m.turma_id
GROUP BY t.status, m.status
ORDER BY t.status, m.status;

-- ============================================================
-- FIM M18
-- ============================================================
