-- ============================================================
-- Migration M17 — Backfill de Pagamentos + Auth Hook JWT
-- HLV EduOS
-- ============================================================
--
-- O que faz:
--   1. Backfill: cria pagamentos para matrículas existentes sem cobrança
--   2. Auth Hook: injeta tenant_id + user_role no JWT (app_metadata)
--
-- Execute no Supabase SQL Editor (painel de produção).
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- 1. BACKFILL: pagamentos para matrículas sem cobrança
-- ══════════════════════════════════════════════════════════════
-- Aplica apenas a matrículas:
--   - Não canceladas
--   - Curso com valor_padrao > 0
--   - Sem nenhum registro em pagamentos ainda

INSERT INTO public.pagamentos (
  tenant_id, matricula_id, aluno_id, curso_id,
  valor, data_vencimento, status
)
SELECT
  m.tenant_id,
  m.id                                                                  AS matricula_id,
  m.aluno_id,
  m.curso_id,
  c.valor_padrao                                                        AS valor,
  COALESCE(t.data_inicio, m.created_at::DATE + INTERVAL '30 days')     AS data_vencimento,
  CASE
    WHEN m.status IN ('concluido', 'certificado_emitido') THEN 'pendente'
    ELSE 'pendente'
  END                                                                   AS status
FROM public.matriculas m
JOIN public.cursos     c ON c.id = m.curso_id
LEFT JOIN public.turmas t ON t.id = m.turma_id
WHERE c.valor_padrao > 0
  AND m.status NOT IN ('cancelado')
  AND NOT EXISTS (
    SELECT 1 FROM public.pagamentos p WHERE p.matricula_id = m.id
  );

-- Resultado esperado: N rows inserted (uma por matrícula sem pagamento)
SELECT COUNT(*) AS pagamentos_criados FROM public.pagamentos;


-- ══════════════════════════════════════════════════════════════
-- 2. AUTH HOOK: injeta tenant_id no JWT
-- ══════════════════════════════════════════════════════════════
-- Após criar esta função, configure no Dashboard:
--   Authentication → Hooks → Custom Access Token Hook
--   → Selecione: public.custom_access_token_hook
--
-- O JWT passará a conter:
--   app_metadata.tenant_id  → usado por get_tenant_id() nas RLS
--   app_metadata.user_role  → role do perfil (admin, secretaria, etc.)

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  claims     JSONB;
  v_tenant   UUID;
  v_role     TEXT;
BEGIN
  claims := event -> 'claims';

  -- Busca tenant_id e role do perfil para o usuário autenticado
  SELECT tenant_id, role
  INTO v_tenant, v_role
  FROM public.perfis
  WHERE user_id = (event ->> 'user_id')::UUID
  LIMIT 1;

  -- Injeta no app_metadata apenas se o perfil existir
  IF v_tenant IS NOT NULL THEN
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      COALESCE(claims -> 'app_metadata', '{}')
        || jsonb_build_object(
             'tenant_id', v_tenant,
             'user_role', v_role
           )
    );
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Garante que a função pode ser chamada pelo serviço de Auth
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;

-- ══════════════════════════════════════════════════════════════
-- PASSOS MANUAIS OBRIGATÓRIOS (Dashboard Supabase)
-- ══════════════════════════════════════════════════════════════
--
-- 1. Authentication → Hooks
--    → Enable Hook: "Customize Access Token (JWT) Claims"
--    → Schema: public  |  Function: custom_access_token_hook
--    → Salvar
--
-- 2. Após ativar, todos os novos logins receberão tenant_id no JWT.
--    Sessões existentes precisam de re-login para atualizar o token.
--
-- 3. Verificar no Supabase Auth Logs se o hook está sendo chamado
--    (Authentication → Logs → filtrar por "hook").
--
-- ============================================================
-- FIM M17
-- ============================================================
