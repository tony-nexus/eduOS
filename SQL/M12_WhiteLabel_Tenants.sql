-- ============================================================
-- M12 — White-label: adiciona colunas de personalização à tabela tenants
-- Executar no Supabase SQL Editor
-- ============================================================

-- Novas colunas de personalização
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS cor_secundaria        VARCHAR(20)  DEFAULT '#5b8af0',
  ADD COLUMN IF NOT EXISTS tema_padrao           VARCHAR(20)  DEFAULT 'neon-glass'
                                                 CHECK (tema_padrao IN ('neon-glass','ocean-glass','dark','light')),
  ADD COLUMN IF NOT EXISTS email_contato         VARCHAR(255),
  ADD COLUMN IF NOT EXISTS telefone              VARCHAR(20),
  ADD COLUMN IF NOT EXISTS site                  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS assinante_certificados VARCHAR(255),
  ADD COLUMN IF NOT EXISTS alertas_renovacao     JSONB        DEFAULT '{"dias_30": true, "dias_7": true, "expirado": false}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ  DEFAULT timezone('utc', now());

-- Policy de UPDATE para admin e super_admin
-- (super_admin já tem bypass total via "Super_Admin_Bypass")
DROP POLICY IF EXISTS "Tenants_Admin_Update" ON public.tenants;
CREATE POLICY "Tenants_Admin_Update"
  ON public.tenants FOR UPDATE
  USING (id = public.get_tenant_id() AND public.get_user_role() IN ('admin', 'super_admin'))
  WITH CHECK (id = public.get_tenant_id());
