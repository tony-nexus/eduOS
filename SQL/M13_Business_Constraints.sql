-- ============================================================
-- Migration M13 — Business Constraints
-- HLV EduOS · Guardiões de regras de negócio no banco
-- ============================================================
--
-- O que faz:
--   1. Limita carga_horaria de cursos a 9.000 h
--   2. Limita valor_padrao de cursos a R$ 100.000
--   3. Garante que validade_meses seja NULL (vitalício) ou 1-600
--   4. Limita vagas de turmas a 31 alunos
--
-- Pré-requisito:
--   Nenhum curso existente deve violar esses limites.
--   Se houver, corrija os dados ANTES de rodar esta migration.
--
-- Execute no Supabase SQL Editor (painel de produção).
-- ============================================================

-- ── 1. Verificação prévia (rodar antes do ALTER) ─────────────
-- Se retornar linhas, corrija os dados antes de continuar.

SELECT id, nome, carga_horaria
  FROM public.cursos
 WHERE carga_horaria > 9000 OR carga_horaria < 1;

SELECT id, nome, valor_padrao
  FROM public.cursos
 WHERE valor_padrao <= 0 OR valor_padrao > 100000;

SELECT id, nome, validade_meses
  FROM public.cursos
 WHERE validade_meses IS NOT NULL
   AND (validade_meses < 1 OR validade_meses > 600);

SELECT id, codigo, vagas
  FROM public.turmas
 WHERE vagas > 31 OR vagas < 1;

-- ── 2. Aplicar constraints ────────────────────────────────────

-- Carga horária: 1–9.000 h
ALTER TABLE public.cursos
  ADD CONSTRAINT chk_cursos_carga_horaria
  CHECK (carga_horaria >= 1 AND carga_horaria <= 9000);

-- Valor padrão: > 0 e ≤ R$ 100.000
ALTER TABLE public.cursos
  ADD CONSTRAINT chk_cursos_valor_padrao
  CHECK (valor_padrao > 0 AND valor_padrao <= 100000);

-- Validade: NULL (vitalício) ou entre 1 e 600 meses
ALTER TABLE public.cursos
  ADD CONSTRAINT chk_cursos_validade_meses
  CHECK (validade_meses IS NULL OR (validade_meses >= 1 AND validade_meses <= 600));

-- Vagas por turma: 1–31 alunos
ALTER TABLE public.turmas
  ADD CONSTRAINT chk_turmas_vagas
  CHECK (vagas >= 1 AND vagas <= 31);

-- ── 3. Verificação pós-migration ─────────────────────────────

SELECT conname, conrelid::regclass AS tabela, pg_get_constraintdef(oid) AS definicao
  FROM pg_constraint
 WHERE conname LIKE 'chk_%'
   AND conrelid::regclass::text IN ('public.cursos', 'public.turmas')
 ORDER BY conrelid::regclass, conname;

-- Resultado esperado: 4 constraints listadas.
