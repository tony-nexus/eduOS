/**
 * /js/core/auth.js
 * Autenticação real via Supabase + modo demo local.
 *
 * CORREÇÕES APLICADAS:
 *  - currentUser exposto em globalThis.__eduos_auth para getTenantId() sem import circular
 *  - initials gerado com segurança (guard contra nomes undefined)
 *  - Mensagens de erro em PT-BR mais descritivas
 *  - [FIX CRÍTICO] showNavForPerfil() oculta itens do sidebar sem permissão
 *  - [UX] initAuth() nunca auto-redireciona — exige clique do usuário no login
 */

import { navigate } from './router.js';
import { showLoadingScreen } from '../ui/loading.js';
import { loadAndApplyBranding } from '../ui/branding.js';
import { initNotifications } from './notifications.js';

export let currentUser = null;

// Sessão ativa detectada na inicialização (reutilizada sem re-auth se email bater)
let _cachedSession = null;

// Expõe para getTenantId() sem criar dependência circular
function _syncGlobal() {
  globalThis.__eduos_auth = { currentUser };
}

// ─── Login real ───────────────────────────────────────────────────────────────
export async function doLogin(email, password) {
  const errorEl = document.getElementById('login-error');
  errorEl.style.display = 'none';

  setLoginLoading(true);
  try {
    const { getClient } = await import('./supabase.js');
    const client = await getClient();

    let userId;

    // Reutiliza sessão ativa se o e-mail bater (sem re-autenticar)
    if (_cachedSession?.user?.email === email) {
      userId = _cachedSession.user.id;
    } else {
      const { data: authData, error: authError } =
        await client.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      userId = authData.user.id;
      _cachedSession = null;
    }

    const { data: perfil, error: perfilError } = await client
      .from('perfis')
      .select('nome, role, tenant_id')
      .eq('user_id', userId)
      .single();

    if (perfilError) throw new Error('Perfil não encontrado. Contate o administrador.');

    currentUser = {
      id:        userId,
      email,
      name:      perfil.nome,
      role:      perfil.role,
      initials:  _makeInitials(perfil.nome),
      perfil:    perfil.role,
      tenant_id: perfil.tenant_id,
    };
    _syncGlobal();

    showApp();
    navigate(perfil.role === 'aluno' ? 'portal-aluno' : 'dashboard');
    loadAndApplyBranding(); // White-label: aplica cores/logo do tenant
    showLoadingScreen();
    initNotifications();

  } catch (err) {
    const msgs = {
      'Invalid login credentials': 'E-mail ou senha incorretos.',
      'Email not confirmed':        'Confirme seu e-mail antes de fazer login.',
    };
    errorEl.textContent = msgs[err.message] ?? err.message ?? 'Erro ao fazer login.';
    errorEl.style.display = 'block';
  } finally {
    setLoginLoading(false);
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
export async function logout() {
  currentUser = null;
  _syncGlobal();
  try {
    const { getClient } = await import('./supabase.js');
    const client = await getClient();
    await client.auth.signOut();
  } catch (err) { console.error("Erro no logout", err); }
  hideApp();
}

// ─── Restaurar sessão ao carregar ─────────────────────────────────────────────
// Nunca auto-redireciona. Apenas cache a sessão e prepara a UI de login.
export async function initAuth() {
  try {
    const { getClient } = await import('./supabase.js');
    const client = await getClient();

    const { data: { session } } = await client.auth.getSession();
    if (!session?.user) return false;

    // Verifica se o perfil é válido (logout preventivo se não houver)
    const { data: perfil, error: perfilError } = await client
      .from('perfis')
      .select('nome, role, tenant_id')
      .eq('user_id', session.user.id)
      .single();

    if (perfilError || !perfil) {
      await client.auth.signOut();
      const errEl = document.getElementById('login-error');
      if (errEl) {
        errEl.textContent = 'Conta sem perfil configurado. Contate o administrador.';
        errEl.style.display = 'block';
      }
      return false;
    }

    // Cacheia sessão e adapta UI para "um clique"
    _cachedSession = session;
    _setupSessionUI(session, perfil.nome);
    loadAndApplyBranding(); // aplica branding mesmo antes do clique (sidebar visível)

  } catch (_) { /* sem sessão */ }
  return false; // sempre exibe a tela de login
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Adapta o formulário de login quando já há uma sessão ativa:
 *  - Pré-preenche o e-mail
 *  - Esconde o campo de senha (não é necessário redigitar)
 *  - Muda o botão para "Continuar como [nome]"
 *  - Se o usuário editar o e-mail, restaura o formulário normal
 */
function _setupSessionUI(session, nomeUsuario) {
  const emailEl   = document.getElementById('login-email');
  const passField = document.getElementById('login-pass')?.closest('.form-field');
  const btnEl     = document.getElementById('login-btn');
  const hintEl    = document.getElementById('login-session-hint');

  if (emailEl) emailEl.value = session.user.email;

  if (passField) passField.style.display = 'none';

  if (btnEl) {
    const primeiro = nomeUsuario?.split(' ')[0] ?? 'você';
    btnEl.innerHTML = `Continuar como ${primeiro} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
  }

  if (hintEl) {
    hintEl.textContent = `Sessão ativa · ${session.user.email}`;
    hintEl.style.display = 'block';
  }

  // Se o usuário alterar o e-mail, restaura formulário normal
  emailEl?.addEventListener('input', function _onEmailChange() {
    if (this.value !== session.user.email) {
      _cachedSession = null;
      if (passField) passField.style.display = '';
      if (btnEl) btnEl.innerHTML = `Entrar na plataforma <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
      if (hintEl) hintEl.style.display = 'none';
      emailEl.removeEventListener('input', _onEmailChange);
    }
  });
}

function _makeInitials(name) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');

  // Fecha o drawer mobile se estiver aberto
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('open');

  if (currentUser) {
    document.getElementById('user-avatar-sidebar').textContent = currentUser.initials;
    document.getElementById('user-name-sidebar').textContent   = currentUser.name;
    document.getElementById('user-role-sidebar').textContent   = currentUser.role;

    // Popula info do usuário no bottom sheet mobile
    const sheetAvatar = document.getElementById('sheet-user-avatar');
    const sheetName   = document.getElementById('sheet-user-name');
    const sheetRole   = document.getElementById('sheet-user-role');
    if (sheetAvatar) sheetAvatar.textContent = currentUser.initials;
    if (sheetName)   sheetName.textContent   = currentUser.name;
    if (sheetRole)   sheetRole.textContent   = currentUser.role;

    // [FIX CRÍTICO] Filtra nav items pelo perfil
    showNavForPerfil(currentUser.perfil ?? currentUser.role ?? '');
  }
}

/**
 * Oculta itens do sidebar que o perfil não pode acessar.
 * Usa a mesma tabela ROUTE_PERMISSIONS do router.js (replicada aqui para evitar import cíclico).
 * Admin e super_admin veem tudo.
 */
function showNavForPerfil(perfil) {
  const p = (perfil ?? '').toLowerCase();
  const isAdmin = p === 'admin' || p === 'super_admin' || p === 'administrador';

  // Permissões replicadas do router.js (sem import cíclico)
  const PERMS = {
    dashboard:     ['secretaria', 'coordenador', 'financeiro', 'comercial', 'instrutor'],
    alunos:        ['secretaria', 'coordenador', 'comercial'],
    turmas:        ['secretaria', 'coordenador', 'instrutor'],
    cursos:        ['secretaria', 'coordenador'],
    instrutores:   ['secretaria', 'coordenador'],
    matriculas:    ['secretaria', 'comercial'],
    pipeline:      ['secretaria', 'comercial', 'coordenador'],
    certificados:  ['secretaria', 'coordenador'],
    empresas:      ['secretaria', 'comercial', 'financeiro'],
    renovacoes:    ['secretaria', 'comercial', 'coordenador'],
    financeiro:    ['financeiro'],
    relatorios:    ['financeiro', 'coordenador'],
    rbac:           [],
    configuracoes:  [],
    'portal-aluno': ['aluno'],
  };

  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    const page = item.dataset.page;
    if (isAdmin) {
      item.style.display = '';
      return;
    }
    const allowed = PERMS[page];
    const podeAcessar = allowed === undefined || allowed.includes(p);
    item.style.display = podeAcessar ? '' : 'none';
  });
}

function hideApp() {
  _cachedSession = null;
  document.getElementById('app').classList.remove('visible');
  document.getElementById('login-screen').style.display = '';

  const emailEl   = document.getElementById('login-email');
  const passEl    = document.getElementById('login-pass');
  const passField = passEl?.closest('.form-field');
  const btnEl     = document.getElementById('login-btn');
  const hintEl    = document.getElementById('login-session-hint');

  if (emailEl)   emailEl.value = '';
  if (passEl)    passEl.value  = '';
  if (passField) passField.style.display = '';
  if (btnEl)     btnEl.innerHTML = `Entrar na plataforma <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
  if (hintEl)    hintEl.style.display = 'none';
}

function setLoginLoading(loading) {
  const btn = document.getElementById('login-btn');
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? `<span style="opacity:0.7">Autenticando...</span>`
    : `Entrar na plataforma <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
}
