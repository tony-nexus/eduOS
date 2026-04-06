-- ============================================================
-- M11 — Helper multi-tenant: função reutilizável para vincular
--        usuários a tenants. Use sempre que adicionar uma escola
--        nova ou um usuário novo.
-- Executar no Supabase SQL Editor
-- ============================================================

-- ─── Função helper ────────────────────────────────────────────
-- Vincula um usuário (já cadastrado no Auth) a um tenant com role.
-- Cria o tenant se não existir.
-- Uso: SELECT public.add_user_to_tenant('email', 'Escola', 'Nome', 'role');
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_user_to_tenant(
  p_email       TEXT,
  p_tenant_nome TEXT,
  p_nome        TEXT,
  p_role        TEXT  -- 'admin' | 'coordenador' | 'secretaria' | 'financeiro' | 'comercial' | 'instrutor' | 'aluno'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id   UUID;
  v_tenant_id UUID;
BEGIN
  -- Busca usuário pelo e-mail
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN 'ERRO: usuário ' || p_email || ' não encontrado no Auth. Convide-o primeiro pelo Dashboard.';
  END IF;

  -- Busca ou cria o tenant
  SELECT id INTO v_tenant_id
  FROM public.tenants
  WHERE nome = p_tenant_nome
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    v_tenant_id := gen_random_uuid();
    INSERT INTO public.tenants (id, nome, cor_primaria)
    VALUES (v_tenant_id, p_tenant_nome, '#63ffab');
  END IF;

  -- Cria perfil (upsert: atualiza role se já existir)
  INSERT INTO public.perfis (user_id, tenant_id, nome, role)
  VALUES (v_user_id, v_tenant_id, p_nome, p_role)
  ON CONFLICT (user_id, tenant_id)
  DO UPDATE SET nome = EXCLUDED.nome, role = EXCLUDED.role;

  RETURN 'OK: ' || p_email || ' → tenant "' || p_tenant_nome || '" como ' || p_role;
END;
$$;

-- ============================================================
-- EXEMPLOS DE USO — rode cada SELECT individualmente
-- após convidar os usuários via Dashboard do Supabase
-- ============================================================

-- ── Escola HLV (3 contas) ─────────────────────────────────────
SELECT public.add_user_to_tenant('hlv.edu@osedu.com',    'HLV',  'HLV Admin',       'admin');
SELECT public.add_user_to_tenant('coordenador@hlv.com',  'HLV',  'Coordenador HLV', 'coordenador');
SELECT public.add_user_to_tenant('secretaria@hlv.com',   'HLV',  'Secretaria HLV',  'secretaria');

-- ── Escola Nexus (5 contas) ───────────────────────────────────
SELECT public.add_user_to_tenant('admin@nexus.com',      'Nexus', 'Admin Nexus',      'admin');
SELECT public.add_user_to_tenant('coord@nexus.com',      'Nexus', 'Coordenador Nexus','coordenador');
SELECT public.add_user_to_tenant('secretaria@nexus.com', 'Nexus', 'Secretaria Nexus', 'secretaria');
SELECT public.add_user_to_tenant('financeiro@nexus.com', 'Nexus', 'Financeiro Nexus', 'financeiro');
SELECT public.add_user_to_tenant('instrutor@nexus.com',  'Nexus', 'Instrutor Nexus',  'instrutor');

-- ── Para verificar o que foi criado ──────────────────────────
SELECT
  t.nome  AS escola,
  p.nome  AS usuario,
  u.email,
  p.role,
  t.id    AS tenant_id
FROM public.perfis p
JOIN public.tenants t ON t.id = p.tenant_id
JOIN auth.users u     ON u.id = p.user_id
ORDER BY t.nome, p.role;
