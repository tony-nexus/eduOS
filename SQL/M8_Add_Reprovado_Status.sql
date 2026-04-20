-- ==============================================================================
-- M8_Add_Reprovado_Status.sql
-- Adiciona o status 'reprovado' à constraint de matriculas.
--
-- O que faz:
--   1. Remove a constraint CHECK antiga de status
--   2. Cria nova constraint incluindo 'reprovado'
--
-- SEGURO para banco populado — não altera dados existentes.
-- ==============================================================================

BEGIN;

-- Remove a constraint existente (nome pode variar — cobre os dois padrões comuns)
ALTER TABLE public.matriculas
  DROP CONSTRAINT IF EXISTS matriculas_status_check;

ALTER TABLE public.matriculas
  DROP CONSTRAINT IF EXISTS chk_matriculas_status;

-- Adiciona nova constraint com 'reprovado'
ALTER TABLE public.matriculas
  ADD CONSTRAINT matriculas_status_check
  CHECK (status IN (
    'matriculado',
    'aguardando_turma',
    'em_andamento',
    'concluido',
    'cancelado',
    'certificado_emitido',
    'reprovado'
  ));

COMMIT;

-- ==============================================================================
-- Verificação pós-migração:
-- ==============================================================================
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = 'public.matriculas'::regclass
--   AND contype = 'c';
--
-- Deve incluir 'reprovado' na lista de status válidos.
-- ==============================================================================
