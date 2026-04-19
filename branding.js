/**
 * /js/core/router.js
 * Sistema de navegação SPA para o EduOS.
 *
 * [FIX CRÍTICO] Route guard implementado: cada rota verifica o perfil do
 * usuário antes de carregar. Perfis não autorizados veem uma tela 403.
 *
 * Uso:
 *   import { navigate } from './router.js';
 *   navigate('alunos');
 */

// ─── Mapa de rotas → arquivo de view ─────────────────────────────────────────
const ROUTES = {
  dashboard:     () => import('../views/dashboard.js'),
  alunos:        () => import('../views/alunos.js'),
  turmas:        () => import('../views/turmas.js'),
  cursos:        () => import('../views/cursos.js'),
  instrutores:   () => import('../views/instrutores.js'),
  matriculas:    () => import('../views/matriculas.js'),
  pipeline:      () => import('../views/pipeline.js'),
  certificados:  () => import('../views/certificados.js'),
  empresas:      () => import('../views/empresas.js'),
  renovacoes:    () => import('../views/renovacoes.js'),
  financeiro:    () => import('../views/financeiro.js'),
  relatorios:    () => import('../views/relatorios.js'),
  rbac:          () => import('../views/rbac.js'),
  configuracoes:  () => import('../views/configuracoes.js'),
  'portal-aluno': () => import('../views/portal-aluno.js'),
};

// ─── Títulos do topbar ────────────────────────────────────────────────────────
const PAGE_TITLES = {
  dashboard:     'Dashboard',
  alunos:        'Alunos',
  turmas:        'Turmas',
  cursos:        'Cursos',
  instrutores:   'Instrutores',
  matriculas:    'Matrículas',
  pipeline:      'Pipeline',
  certificados:  'Certificados',
  empresas:      'Empresas B2B',
  renovacoes:    'Renovações',
  financeiro:    'Financeiro',
  relatorios:    'Relatórios',
  rbac:          'Permissões RBAC',
  configuracoes:  'Configurações',
  'portal-aluno': 'Meu Portal',
};

// ─── [FIX CRÍTICO] Permissões por perfil ─────────────────────────────────────
// 'admin' e 'super_admin' têm acesso total — tratados em canAccess().
// Perfis listados por rota recebem acesso. Array vazio = só admin/super_admin.
const ROUTE_PERMISSIONS = {
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
  rbac:           [],               // só admin/super_admin
  configuracoes:  [],               // só admin/super_admin
  'portal-aluno': ['aluno'],        // exclusivo para perfil aluno
};

/** Verifica se o usuário logado pode acessar a rota */
function canAccess(page) {
  const auth = globalThis.__eduos_auth;
  const user = auth?.currentUser;
  if (!user) return false;

  const perfil = (user.perfil ?? user.role ?? '').toLowerCase();

  // Administradores têm acesso irrestrito
  if (perfil === 'admin' || perfil === 'super_admin' || perfil === 'administrador') return true;

  const allowed = ROUTE_PERMISSIONS[page];
  if (allowed === undefined) return true; // rota sem restrição definida

  return allowed.includes(perfil);
}

let _currentPage = 'dashboard';

/** Retorna a página ativa no momento */
export function getCurrentPage() {
  return _currentPage;
}

/**
 * Navega para uma página.
 * 1. [FIX] Verifica permissão de perfil (route guard)
 * 2. Atualiza o nav-item ativo no sidebar
 * 3. Atualiza o título do topbar
 * 4. Faz import dinâmico do módulo de view
 * 5. Chama view.render() para injetar conteúdo no #main-content
 *
 * @param {string} page  - chave da rota (ex: 'alunos')
 */
export async function navigate(page) {
  if (!ROUTES[page]) {
    console.warn(`[Router] Rota desconhecida: "${page}"`);
    return;
  }

  const mainContent = document.getElementById('main-content');

  // ─── [FIX CRÍTICO] Route guard por perfil ─────────────────────────────────
  if (!canAccess(page)) {
    const perfilAtual = globalThis.__eduos_auth?.currentUser?.role ?? 'desconhecido';
    if (mainContent) {
      mainContent.innerHTML = `
        <div class="empty-state" style="padding:60px 24px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
               width="48" height="48" style="color:var(--red);margin-bottom:12px">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          <h3 style="margin-bottom:6px">Acesso Negado</h3>
          <p style="color:var(--text-tertiary);font-size:13px">
            Seu perfil (<strong>${perfilAtual}</strong>) não tem permissão para acessar esta página.
          </p>
        </div>`;
    }
    return;
  }

  _currentPage = page;

  // Atualiza nav-items + aria-current para leitores de tela
  document.querySelectorAll('.nav-item').forEach(el => {
    const isActive = el.dataset.page === page;
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  // Atualiza topbar
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[page] ?? page;

  // Mostra estado de carregamento
  if (mainContent) {
    mainContent.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:200px;
                  color:var(--text-tertiary);font-size:13px;gap:10px">
        <div class="skeleton" style="width:16px;height:16px;border-radius:50%"></div>
        Carregando...
      </div>`;
  }

  try {
    const module = await ROUTES[page]();
    await module.render();
  } catch (err) {
    console.error(`[Router] Erro ao carregar view "${page}":`, err);
    if (mainContent) {
      mainContent.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <h3>Erro ao carregar página</h3>
          <p>${err.message}</p>
        </div>`;
    }
  }
}
