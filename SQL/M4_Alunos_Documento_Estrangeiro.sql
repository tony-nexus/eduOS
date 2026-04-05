-- ==============================================================================
-- M4_Alunos_Documento_Estrangeiro.sql
-- Suporte a documentos de estrangeiros: RNM e CNH Estrangeiro
--
-- Mudanças:
--   1. Adiciona coluna tipo_documento em alunos
--   2. Substitui UNIQUE(tenant_id, cpf)
--      por    UNIQUE(tenant_id, tipo_documento, cpf)
--      (permite mesmo número em tipos distintos — improvável, mas correto)
--   3. Amplia cpf para VARCHAR(20) para acomodar todos os formatos
-- ==============================================================================

-- 1. Nova coluna tipo_documento (default 'cpf' preserva todos os registros existentes)
ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(20)
  NOT NULL DEFAULT 'cpf'
  CHECK (tipo_documento IN ('cpf', 'rnm', 'cnh'));

-- 2. Amplia coluna para suportar todos os formatos:
--    CPF:             000.000.000-00  → 14 chars
--    RNM:             V123456-J       →  9 chars
--    CNH Estrangeiro: 12345678901     → 11 chars
ALTER TABLE public.alunos
  ALTER COLUMN cpf TYPE VARCHAR(20);

-- 3. Remove constraint antiga e cria a nova com tipo_documento incluso
ALTER TABLE public.alunos
  DROP CONSTRAINT IF EXISTS alunos_tenant_id_cpf_key;

ALTER TABLE public.alunos
  ADD CONSTRAINT alunos_tenant_tipo_doc_num_key
  UNIQUE (tenant_id, tipo_documento, cpf);

-- 4. Índice para busca rápida por documento
CREATE INDEX IF NOT EXISTS idx_alunos_cpf
  ON public.alunos(tenant_id, tipo_documento, cpf);

-- ==============================================================================
-- Verificação (rode após a migração):
--   SELECT tipo_documento, count(*) FROM public.alunos GROUP BY 1;
-- ==============================================================================
