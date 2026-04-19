-- ============================================================
-- M5 — Alunos: Múltiplos documentos simultâneos
-- Adiciona colunas rnm e cnh_num separadas, migra dados da
-- coluna genérica cpf quando tipo_documento != 'cpf'.
-- Execute APÓS M4_Alunos_Documento_Estrangeiro.sql.
-- ============================================================

-- 1. Novas colunas de documento
ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS rnm     VARCHAR(9);
ALTER TABLE public.alunos ADD COLUMN IF NOT EXISTS cnh_num VARCHAR(11);

-- 2. Migração de dados existentes
--    Se tipo_documento = 'rnm', move cpf → rnm e limpa cpf
UPDATE public.alunos SET rnm = cpf, cpf = NULL
 WHERE tipo_documento = 'rnm' AND cpf IS NOT NULL;

--    Se tipo_documento = 'cnh', move cpf → cnh_num e limpa cpf
UPDATE public.alunos SET cnh_num = cpf, cpf = NULL
 WHERE tipo_documento = 'cnh' AND cpf IS NOT NULL;

-- 3. Remove constraints antigas (M4)
ALTER TABLE public.alunos DROP CONSTRAINT IF EXISTS alunos_tenant_tipo_doc_num_key;
DROP  INDEX IF EXISTS public.idx_alunos_cpf;

-- 4. Partial unique indexes por tipo de documento
CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_cpf_unique
  ON public.alunos(tenant_id, cpf)
  WHERE cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_rnm_unique
  ON public.alunos(tenant_id, rnm)
  WHERE rnm IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alunos_cnh_unique
  ON public.alunos(tenant_id, cnh_num)
  WHERE cnh_num IS NOT NULL;

-- 5. (Opcional) Remover coluna tipo_documento — foi substituída pelos campos individuais
--    Comente a linha abaixo se ainda quiser manter para referência histórica
-- ALTER TABLE public.alunos DROP COLUMN IF EXISTS tipo_documento;
