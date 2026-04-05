/**
 * /js/core/supabase.js
 * Configuração do cliente Supabase para o EduOS.
 *
 * CORREÇÕES APLICADAS:
 *  - getTenantId() agora lê currentUser.tenant_id em vez de UUID hardcoded
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://falljvzupzhaxsizxzyi.supabase.co';
const SUPABASE_ANON = 'sb_publishable_mRx2QDJ7glhfAiSWbFByjA_EamR8qcj';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

export const getClient = async () => supabase;

/**
 * Retorna o tenant_id do usuário logado.
 * - Usuário real  → lê currentUser.tenant_id (preenchido via tabela perfis no login)
 */
export function getTenantId() {
  try {
    const u = globalThis.__eduos_auth?.currentUser;
    if (u?.tenant_id) return u.tenant_id;
  } catch (_) { /* módulo ainda não carregado */ }
  return null;
}

export async function getSupabaseUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
