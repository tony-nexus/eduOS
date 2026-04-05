-- ==============================================================================
-- M6_Apply_MultiDoc_Now.sql
-- Migração combinada: aplica M4 + M5 de uma só vez.
-- Execute no SQL Editor do Supabase (Project → SQL Editor → New query).
--
-- O que faz:
--   1. Adiciona coluna tipo_documento (compat. retroativa — default 'cpf')
--   2. Amplia cpf VARCHAR(14) → VARCHAR(20) e torna nullable
--   3. Remove constraint UNIQUE(tenant_id, cpf) antiga
--   4. Adiciona colunas rnm e cnh_num
--   5. Cria partial unique indexes por documento
--   6. (Limpeza) Remove índices e constraints de versões anteriores
--
-- SEGURO para banco já populado: usa IF NOT EXISTS e IF EXISTS em tudo.
-- Registros existentes com CPF continuam intactos.
-- ==============================================================================

BEGIN;

-- ── 1. Adiciona tipo_documento ──────────────────────────────────────────────
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(20)
  NOT NULL DEFAULT 'cpf'
  CHECK (tipo_documento IN ('cpf', 'rnm', 'cnh'));

-- ── 2. Amplia cpf e remove NOT NULL ─────────────────────────────────────────
ALTER TABLE public.alunos
  ALTER COLUMN cpf TYPE VARCHAR(20);

ALTER TABLE public.alunos
  ALTER COLUMN cpf DROP NOT NULL;

-- ── 3. Remove constraints únicas antigas ────────────────────────────────────
ALTER TABLE public.alunos
  DROP CONSTRAINT IF EXISTS alunos_tenant_id_cpf_key;

ALTER TABLE public.alunos
  DROP CONSTRAINT IF EXISTS alunos_tenant_tipo_doc_num_key;

-- ── 4. Adiciona rnm e cnh_num ────────────────────────────────────────────────
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS rnm     VARCHAR(9);

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS cnh_num VARCHAR(11);

-- ── 5. Remove índices legados ────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_alunos_cpf;

-- ── 6. Cria partial unique indexes por tipo de documento ────────────────────
--      Permitem NULL (aluno com RNM não precisa ter CPF) e evitam duplicatas
--      dentro do mesmo tenant para cada tipo de documento.

CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_cpf_unique
  ON public.alunos(tenant_id, cpf)
  WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_rnm_unique
  ON public.alunos(tenant_id, rnm)
  WHERE rnm IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_cnh_unique
  ON public.alunos(tenant_id, cnh_num)
  WHERE cnh_num IS NOT NULL;

COMMIT;

-- ==============================================================================
-- Verificação pós-migração (rode logo após para confirmar):
-- ==============================================================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'alunos'
--   AND column_name IN ('cpf','rnm','cnh_num','tipo_documento')
-- ORDER BY column_name;
--
-- Esperado:
--   cnh_num       | character varying | YES
--   cpf           | character varying | YES
--   rnm           | character varying | YES
--   tipo_documento| character varying | NO
-- ==============================================================================
