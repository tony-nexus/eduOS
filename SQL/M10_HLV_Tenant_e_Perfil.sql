-- ============================================================
-- M10 — Cria tenant HLV Edu e perfil admin para hlv.edu@osedu.com
-- Executar no Supabase SQL Editor
-- ============================================================

DO $$
DECLARE
  v_user_id   UUID;
  v_tenant_id UUID := gen_random_uuid();
BEGIN

  -- 1. Busca o user_id pelo e-mail em auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = 'hlv.edu@osedu.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário hlv.edu@osedu.com não encontrado em auth.users.';
  END IF;

  -- 2. Cria o tenant HLV Edu (ignora se já existir com mesmo nome)
  INSERT INTO public.tenants (id, nome, cnpj, cor_primaria)
  VALUES (v_tenant_id, 'HLV Edu', NULL, '#63ffab')
  ON CONFLICT DO NOTHING;

  -- Se o tenant já existia, usa o ID existente
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE nome = 'HLV Edu'
  LIMIT 1;

  -- 3. Cria o perfil admin (ignora se já existir para este user)
  INSERT INTO public.perfis (user_id, tenant_id, nome, role)
  VALUES (v_user_id, v_tenant_id, 'HLV Admin', 'admin')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'OK — tenant_id: %, user_id: %', v_tenant_id, v_user_id;
END;
$$;
