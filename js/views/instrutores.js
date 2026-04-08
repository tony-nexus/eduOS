/**
 * /js/views/instrutores.js  v2 — Master-Detail Layout
 *
 * Estrutura de tela:
 *   ┌─────────────────┬──────────────────────────────────────┐
 *   │  MASTER (~35%)  │  DETAIL (~65%)                       │
 *   │  Lista de       │  Turmas do instrutor selecionado     │
 *   │  instrutores    │  + Modal de alunos por turma         │
 *   └─────────────────┴──────────────────────────────────────┘
 *
 * Dados de turmas e alunos usam mock enquanto as queries
 * Supabase do detalhe não estão configuradas.
 * Para integrar: substitua as funções marcadas com "TODO: Supabase".
 */

import { supabase, getTenantId }                   from '../core/supabase.js';
import { setContent, openModal, closeModal, toast,
         fmtDate, esc }                            from '../ui/components.js';
import { validateForm, bindBlur }                  from '../ui/validate.js';

// ─── State do módulo ──────────────────────────────────────────────────────────
let _cache    = [];    // instrutores do tenant (via Supabase)
let _activeId = null;  // ID do instrutor selecionado no momento

// ─── Maps de status (consistentes com turmas.js) ──────────────────────────────
const STATUS_BADGE = {
  agendada:     'badge-blue',
  em_andamento: 'badge-amber',
  concluida:    'badge-green',
  cancelada:    'badge-red',
};
const STATUS_LABEL = {
  agendada:     'Agendada',
  em_andamento: 'Em Andamento',
  concluida:    'Concluída',
  cancelada:    'Cancelada',
};
const ALUNO_BADGE = {
  matriculado:         'badge-blue',
  aguardando_turma:    'badge-amber',
  em_andamento:        'badge-amber',
  concluido:           'badge-green',
  certificado_emitido: 'badge-purple',
  reprovado:           'badge-red',
  cancelado:           'badge-gray',
};
const ALUNO_LABEL = {
  matriculado:         'Matriculado',
  aguardando_turma:    'Ag. Turma',
  em_andamento:        'Em Andamento',
  concluido:           'Concluído',
  certificado_emitido: 'Cert. Emitido',
  reprovado:           'Reprovado',
  cancelado:           'Cancelado',
};

// ══════════════════════════════════════════════════════════════════════════════
//  MOCK DATA — substitua pelas queries Supabase ao integrar o backend
//  As estruturas de dados espelham exatamente o que o Supabase retornaria.
// ══════════════════════════════════════════════════════════════════════════════
// 4 conjuntos distintos — cada instrutor recebe um deles por ordem na lista
const _MOCK_TURMA_SETS = [
  // Set A
  [
    { id:'mt-a1', codigo:'NR35-2025-001', curso_nome:'NR-35 Trabalho em Altura',          status:'em_andamento', ocupadas:14, vagas:20, data_inicio:'2025-03-01', data_fim:'2025-03-08' },
    { id:'mt-a2', codigo:'NR33-2025-001', curso_nome:'NR-33 Espaço Confinado',            status:'agendada',     ocupadas: 8, vagas:16, data_inicio:'2025-05-10', data_fim:'2025-05-13' },
    { id:'mt-a3', codigo:'NR35-2024-008', curso_nome:'NR-35 Trabalho em Altura',          status:'concluida',    ocupadas:19, vagas:20, data_inicio:'2024-11-04', data_fim:'2024-11-11' },
  ],
  // Set B
  [
    { id:'mt-b1', codigo:'PS-2025-002',   curso_nome:'Primeiros Socorros',                status:'em_andamento', ocupadas:11, vagas:20, data_inicio:'2025-02-10', data_fim:'2025-02-11' },
    { id:'mt-b2', codigo:'NR20-2025-001', curso_nome:'NR-20 Inflamáveis e Combustíveis', status:'agendada',     ocupadas: 4, vagas:16, data_inicio:'2025-06-05', data_fim:'2025-06-07' },
    { id:'mt-b3', codigo:'NR20-2024-003', curso_nome:'NR-20 Inflamáveis e Combustíveis', status:'concluida',    ocupadas:16, vagas:16, data_inicio:'2024-12-02', data_fim:'2024-12-04' },
    { id:'mt-b4', codigo:'PS-2024-005',   curso_nome:'Primeiros Socorros',                status:'concluida',    ocupadas:13, vagas:20, data_inicio:'2024-08-05', data_fim:'2024-08-06' },
  ],
  // Set C
  [
    { id:'mt-c1', codigo:'NR10-2025-001', curso_nome:'NR-10 Segurança em Eletricidade',  status:'agendada',     ocupadas: 5, vagas:20, data_inicio:'2025-06-15', data_fim:'2025-06-19' },
    { id:'mt-c2', codigo:'NR12-2025-001', curso_nome:'NR-12 Segurança em Máquinas',      status:'agendada',     ocupadas: 3, vagas:16, data_inicio:'2025-07-07', data_fim:'2025-07-10' },
    { id:'mt-c3', codigo:'NR35-2024-011', curso_nome:'NR-35 Trabalho em Altura',          status:'concluida',    ocupadas:20, vagas:20, data_inicio:'2024-10-14', data_fim:'2024-10-21' },
  ],
  // Set D — instrutor sem turmas (testa estado vazio)
  [],
];

const _MOCK_ALUNOS = {
  // Set A
  'mt-a1': [
    { id:'a01', nome:'João Carlos Melo',      doc:'CPF: 321.654.987-00', status:'em_andamento' },
    { id:'a02', nome:'Ana Paula Rodrigues',   doc:'CPF: 456.789.012-34', status:'em_andamento' },
    { id:'a03', nome:'Bruno Henrique Lima',   doc:'RNM: V123456-J',      status:'em_andamento' },
    { id:'a04', nome:'Carla Souza Ferreira',  doc:'CPF: 789.012.345-67', status:'em_andamento' },
    { id:'a05', nome:'Diego Martins Pereira', doc:'CPF: 012.345.678-90', status:'em_andamento' },
  ],
  'mt-a2': [
    { id:'a06', nome:'Elaine Borges',         doc:'CPF: 135.246.357-80', status:'matriculado' },
    { id:'a07', nome:'Fábio Correia',         doc:'CPF: 246.357.468-91', status:'matriculado' },
    { id:'a08', nome:'Gabriela Santos',       doc:'CPF: 357.468.579-02', status:'matriculado' },
  ],
  'mt-a3': [
    { id:'a09', nome:'Henrique Costa',        doc:'CPF: 468.579.680-13', status:'concluido' },
    { id:'a10', nome:'Igor Lima',             doc:'CPF: 579.680.791-24', status:'concluido' },
    { id:'a11', nome:'Júlia Viana',           doc:'CPF: 680.791.802-35', status:'reprovado'  },
  ],
  // Set B
  'mt-b1': [
    { id:'b01', nome:'Kaio Teixeira',         doc:'CNH: 01234567890',    status:'em_andamento' },
    { id:'b02', nome:'Larissa Almeida',       doc:'CPF: 791.802.913-46', status:'em_andamento' },
    { id:'b03', nome:'Marcos Freitas',        doc:'CPF: 802.913.024-57', status:'em_andamento' },
    { id:'b04', nome:'Natália Rocha',         doc:'CPF: 913.024.135-68', status:'em_andamento' },
  ],
  'mt-b2': [
    { id:'b05', nome:'Otávio Barbosa',        doc:'CPF: 024.135.246-79', status:'matriculado' },
    { id:'b06', nome:'Patrícia Castro',       doc:'CPF: 135.246.357-80', status:'matriculado' },
  ],
  'mt-b3': [
    { id:'b07', nome:'Rafael Mendes',         doc:'RNM: A654321-B',      status:'concluido' },
    { id:'b08', nome:'Sabrina Luz',           doc:'CPF: 246.357.468-91', status:'concluido' },
    { id:'b09', nome:'Thiago Reis',           doc:'CPF: 357.468.579-02', status:'concluido' },
  ],
  'mt-b4': [
    { id:'b10', nome:'Ursula Gomes',          doc:'CPF: 468.579.680-13', status:'concluido' },
    { id:'b11', nome:'Vitor Cardoso',         doc:'CPF: 579.680.791-24', status:'concluido' },
  ],
  // Set C
  'mt-c1': [
    { id:'c01', nome:'Wesley Andrade',        doc:'CPF: 100.200.300-40', status:'matriculado' },
    { id:'c02', nome:'Xuxa Pereira',          doc:'CPF: 200.300.400-50', status:'matriculado' },
    { id:'c03', nome:'Yara Fontes',           doc:'CPF: 300.400.500-60', status:'matriculado' },
  ],
  'mt-c2': [
    { id:'c04', nome:'Zilda Monteiro',        doc:'CPF: 400.500.600-70', status:'matriculado' },
    { id:'c05', nome:'Alan Braga',            doc:'RNM: C789012-D',      status:'matriculado' },
  ],
  'mt-c3': [
    { id:'c06', nome:'Beatriz Tavares',       doc:'CPF: 500.600.700-80', status:'concluido' },
    { id:'c07', nome:'Caio Neves',            doc:'CPF: 600.700.800-90', status:'concluido' },
    { id:'c08', nome:'Débora Pinheiro',       doc:'CPF: 700.800.900-01', status:'concluido' },
    { id:'c09', nome:'Eduardo Magalhães',     doc:'CPF: 800.900.001-12', status:'reprovado'  },
  ],
};

// ─── Fetch turmas do instrutor ────────────────────────────────────────────────
/**
 * TODO: Supabase — substituir o bloco mock pela query abaixo:
 *
 * const { data, error } = await supabase
 *   .from('turmas')
 *   .select('id, codigo, status, ocupadas, vagas, data_inicio, data_fim, curso:curso_id(nome)')
 *   .eq('tenant_id', getTenantId())
 *   .eq('instrutor_id', instrutorId)
 *   .order('data_inicio', { ascending: false });
 * if (error) throw error;
 * return (data || []).map(t => ({ ...t, curso_nome: t.curso?.nome ?? '—' }));
 */
async function loadTurmasDoInstrutor(instrutorId) {
  // Mock: cada instrutor recebe um conjunto diferente pela posição na lista
  const idx = _cache.findIndex(i => i.id === instrutorId);
  return _MOCK_TURMA_SETS[(idx >= 0 ? idx : 0) % _MOCK_TURMA_SETS.length];
}

// ─── Fetch alunos de uma turma ────────────────────────────────────────────────
/**
 * TODO: Supabase — substituir o bloco mock pela query abaixo:
 *
 * const { data, error } = await supabase
 *   .from('matriculas')
 *   .select('id, status, aluno:aluno_id(nome, cpf, rnm)')
 *   .eq('tenant_id', getTenantId())
 *   .eq('turma_id', turmaId)
 *   .neq('status', 'cancelado')
 *   .order('aluno(nome)');
 * if (error) throw error;
 * return (data || []).map(m => ({
 *   id:     m.id,
 *   nome:   m.aluno?.nome ?? '—',
 *   doc:    m.aluno?.cpf  ? `CPF: ${m.aluno.cpf}`
 *         : m.aluno?.rnm  ? `RNM: ${m.aluno.rnm}` : '—',
 *   status: m.status,
 * }));
 */
async function loadAlunosDaTurma(turmaId) {
  return _MOCK_ALUNOS[turmaId] ?? [];
}

// ─── Render principal ─────────────────────────────────────────────────────────
export async function render() {
  _activeId = null;

  setContent(`
    <div class="page-header">
      <div>
        <h1>Instrutores</h1>
        <p>Cadastro e vínculo com turmas</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-novo-inst">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" width="13" height="13" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5"  y1="12" x2="19" y2="12"/>
          </svg>
          Novo Instrutor
        </button>
      </div>
    </div>

    <div class="inst-layout">

      <!-- ── MASTER: lista de instrutores ──────────────────────────────── -->
      <div class="inst-master-panel">
        <div class="table-wrap" style="padding:0;overflow:hidden">

          <div class="table-toolbar"
               style="padding:10px 12px;border-bottom:1px solid var(--border-subtle)">
            <div class="search-input-wrap" style="flex:1">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
              <input class="search-input" id="search-inst"
                     placeholder="Buscar instrutor..."
                     aria-label="Buscar instrutor">
            </div>
          </div>

          <div id="inst-list"
               style="padding:10px 10px 4px;max-height:calc(100vh - 260px);overflow-y:auto">
            ${Array(3).fill(
              '<div class="skeleton" style="height:60px;border-radius:6px;margin-bottom:7px"></div>'
            ).join('')}
          </div>

          <div style="padding:8px 14px;border-top:1px solid var(--border-subtle)">
            <span class="table-info" id="inst-count">—</span>
          </div>
        </div>
      </div>

      <!-- ── DETAIL: turmas do instrutor selecionado ───────────────────── -->
      <div class="inst-detail-panel" id="inst-detail-panel">
        <div id="detail-content">${_renderDetailEmpty()}</div>
      </div>

    </div>
  `);

  // No mobile, o detail começa oculto (só aparece após selecionar instrutor)
  if (window.innerWidth <= 768) {
    document.getElementById('inst-detail-panel')?.classList.add('mob-hide');
  }

  document.getElementById('btn-novo-inst')
    ?.addEventListener('click', () => modalInstrutor());

  document.getElementById('search-inst')
    ?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      renderMasterList(
        _cache.filter(i =>
          i.nome.toLowerCase().includes(q) ||
          (i.email ?? '').toLowerCase().includes(q)
        )
      );
    });

  await loadData();
}

// ─── Fetch instrutores (Supabase) ─────────────────────────────────────────────
async function loadData() {
  try {
    const { data, error } = await supabase
      .from('instrutores')
      .select('*')
      .eq('tenant_id', getTenantId())
      .order('nome');
    if (error) throw error;
    _cache = data || [];
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar instrutores', 'error');
    _cache = [];
  }

  renderMasterList(_cache);

  // Reseleciona o instrutor ativo após re-fetch (ex: pós-edição)
  if (_activeId && _cache.find(i => i.id === _activeId)) {
    selecionarInstrutor(_activeId);
  }
}

// ─── Render lista master ──────────────────────────────────────────────────────
function renderMasterList(inst) {
  const list  = document.getElementById('inst-list');
  const count = document.getElementById('inst-count');
  if (!list) return;

  if (count) {
    count.textContent = `${inst.length} instrutor${inst.length !== 1 ? 'es' : ''}`;
  }

  if (!inst.length) {
    list.innerHTML = `
      <p style="text-align:center;padding:28px 12px;
                color:var(--text-tertiary);font-size:13px">
        Nenhum instrutor encontrado.
      </p>`;
    return;
  }

  list.innerHTML = inst.map(i => {
    const isActive = i.id === _activeId;
    const inicialNome = esc(i.nome.charAt(0).toUpperCase());

    return `
      <div class="inst-item${isActive ? ' active' : ''}"
           data-id="${i.id}"
           role="button" tabindex="0"
           aria-pressed="${isActive}"
           aria-label="${esc(i.nome)}">

        <div class="inst-item-avatar" aria-hidden="true">${inicialNome}</div>

        <div class="inst-item-info">
          <div class="inst-item-name">${esc(i.nome)}</div>
          <div class="inst-item-meta">${esc(i.email ?? 'Sem e-mail')}</div>
        </div>

        <div style="display:flex;gap:3px;flex-shrink:0">
          <button class="action-btn inst-editar"
                  data-id="${i.id}"
                  title="Editar instrutor"
                  aria-label="Editar ${esc(i.nome)}"
                  style="padding:5px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" width="12" height="12" aria-hidden="true">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="action-btn danger inst-excluir"
                  data-id="${i.id}"
                  title="Excluir instrutor"
                  aria-label="Excluir ${esc(i.nome)}"
                  style="padding:5px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" width="12" height="12" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            </svg>
          </button>
        </div>
      </div>`;
  }).join('');

  // ── Click no card (exceto nos botões internos) ────────────────────────────
  list.querySelectorAll('.inst-item').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.inst-editar, .inst-excluir')) return;
      selecionarInstrutor(card.dataset.id);
    });
    card.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') &&
          !e.target.closest('.inst-editar, .inst-excluir')) {
        e.preventDefault();
        selecionarInstrutor(card.dataset.id);
      }
    });
  });

  list.querySelectorAll('.inst-editar').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const i = _cache.find(x => x.id == btn.dataset.id);
      if (i) modalInstrutor(i);
    })
  );

  list.querySelectorAll('.inst-excluir').forEach(btn =>
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const i = _cache.find(x => x.id == btn.dataset.id);
      if (i) confirmarExclusaoInstrutor(i);
    })
  );
}

// ─── Selecionar instrutor → atualiza detail ───────────────────────────────────
function _isMobile() { return window.innerWidth <= 768; }

async function selecionarInstrutor(id) {
  _activeId = id;

  // Atualiza estado visual de todos os cards da lista
  document.querySelectorAll('.inst-item').forEach(card => {
    const isActive = card.dataset.id === id;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-pressed', String(isActive));
  });

  // Mobile: esconde lista, exibe detalhe
  if (_isMobile()) {
    document.querySelector('.inst-master-panel')?.classList.add('mob-hide');
    document.getElementById('inst-detail-panel')?.classList.remove('mob-hide');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Skeleton de carregamento no detail
  const detail = document.getElementById('detail-content');
  if (detail) {
    detail.innerHTML = `
      <div style="min-height:300px;display:flex;align-items:center;
                  justify-content:center;border:1px solid var(--border-subtle);
                  border-radius:var(--radius-md);background:var(--bg-surface)">
        <div style="display:flex;align-items:center;gap:10px;
                    color:var(--text-tertiary);font-size:13px">
          <div class="skeleton"
               style="width:18px;height:18px;border-radius:50%;flex-shrink:0">
          </div>
          Carregando turmas...
        </div>
      </div>`;
  }

  const instrutor = _cache.find(i => i.id === id);
  if (!instrutor) return;

  try {
    const turmas = await loadTurmasDoInstrutor(id);
    renderDetailPanel(instrutor, turmas);
  } catch (err) {
    toast(`Erro ao carregar turmas: ${err.message}`, 'error');
    if (detail) detail.innerHTML = _renderDetailEmpty();
  }
}

// ─── Detail: estado vazio ─────────────────────────────────────────────────────
function _renderDetailEmpty() {
  return `
    <div class="inst-detail-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.2" width="56" height="56" aria-hidden="true">
        <circle cx="18" cy="18" r="3"/>
        <circle cx="6"  cy="6"  r="3"/>
        <circle cx="6"  cy="18" r="3"/>
        <circle cx="18" cy="6"  r="3"/>
        <line x1="9"  y1="6"  x2="15" y2="6"/>
        <line x1="9"  y1="18" x2="15" y2="18"/>
        <line x1="6"  y1="9"  x2="6"  y2="15"/>
      </svg>
      <div style="font-weight:600;font-size:14px;color:var(--text-secondary)">
        Nenhum instrutor selecionado
      </div>
      <div>
        Clique em um instrutor na lista ao lado para visualizar
        suas turmas e os alunos matriculados.
      </div>
    </div>`;
}

// ─── Detail: painel completo ──────────────────────────────────────────────────
function renderDetailPanel(instrutor, turmas) {
  const detail = document.getElementById('detail-content');
  if (!detail) return;

  // Especialidades
  let esps = [];
  if (Array.isArray(instrutor.especialidades))        esps = instrutor.especialidades;
  else if (typeof instrutor.especialidades === 'string')
    esps = instrutor.especialidades.split(',').map(s => s.trim()).filter(Boolean);

  // KPIs
  const nTotal   = turmas.length;
  const nAtivas  = turmas.filter(t => ['agendada','em_andamento'].includes(t.status)).length;
  const nAlunos  = turmas.reduce((s, t) => s + (t.ocupadas || 0), 0);

  // ── Header do instrutor ───────────────────────────────────────────────────
  const header = `
    <div class="card" style="padding:20px 24px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">

        <div style="width:52px;height:52px;border-radius:50%;flex-shrink:0;
                    background:linear-gradient(135deg,var(--blue),var(--purple));
                    display:grid;place-items:center;
                    font-size:20px;font-weight:700;color:#fff"
             aria-hidden="true">
          ${esc(instrutor.nome.charAt(0).toUpperCase())}
        </div>

        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:16px;margin-bottom:2px">
            ${esc(instrutor.nome)}
          </div>
          <div style="font-size:12.5px;color:var(--text-tertiary);margin-bottom:8px">
            ${esc(instrutor.email ?? '—')}
            ${instrutor.telefone ? ` &nbsp;·&nbsp; ${esc(instrutor.telefone)}` : ''}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px">
            ${esps.map(e => `<span class="badge badge-accent">${esc(e)}</span>`).join('')}
            ${!esps.length
              ? '<span style="font-size:11px;color:var(--text-tertiary)">Sem especialidades cadastradas</span>'
              : ''}
          </div>
        </div>

        <div style="display:flex;gap:24px;flex-shrink:0;text-align:center">
          <div>
            <div style="font-size:24px;font-weight:700;color:var(--blue);line-height:1">
              ${nTotal}
            </div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:3px">Turmas</div>
          </div>
          <div>
            <div style="font-size:24px;font-weight:700;color:var(--accent);line-height:1">
              ${nAtivas}
            </div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:3px">Ativas</div>
          </div>
          <div>
            <div style="font-size:24px;font-weight:700;color:var(--amber);line-height:1">
              ${nAlunos}
            </div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:3px">Alunos</div>
          </div>
        </div>

      </div>
    </div>`;

  // ── Tabela de turmas ──────────────────────────────────────────────────────
  let tableHtml;

  if (!turmas.length) {
    tableHtml = `
      <div class="table-wrap">
        <p style="text-align:center;padding:48px;
                  color:var(--text-tertiary);font-size:13px">
          Este instrutor não possui turmas cadastradas.
        </p>
      </div>`;
  } else {
    const rows = turmas.map(t => {
      const pct   = t.vagas > 0 ? Math.round((t.ocupadas / t.vagas) * 100) : 0;
      const pctColor = pct >= 100 ? 'var(--red)'
                     : pct >= 80  ? 'var(--amber)'
                     : 'var(--accent)';
      return `
        <tr>
          <td>
            <span class="badge ${STATUS_BADGE[t.status] ?? 'badge-gray'}">
              ${STATUS_LABEL[t.status] ?? esc(t.status)}
            </span>
          </td>
          <td style="font-weight:500;font-size:13px">${esc(t.curso_nome)}</td>
          <td>
            <div style="display:flex;align-items:center;gap:8px">
              <div class="progress-bar" style="width:52px">
                <div class="progress-fill"
                     style="width:${pct}%;background:${pctColor}"></div>
              </div>
              <span style="font-size:11.5px;color:var(--text-tertiary);
                           font-family:var(--font-mono)">
                ${t.ocupadas ?? 0}/${t.vagas ?? 0}
              </span>
            </div>
          </td>
          <td style="font-size:12.5px;white-space:nowrap">
            ${t.data_inicio ? fmtDate(t.data_inicio) : '—'}
          </td>
          <td style="font-size:12.5px;white-space:nowrap">
            ${t.data_fim ? fmtDate(t.data_fim) : '—'}
          </td>
          <td>
            <button class="action-btn inst-ver-alunos"
                    data-turma-id="${t.id}"
                    data-turma-codigo="${esc(t.codigo)}"
                    title="Ver alunos matriculados"
                    aria-label="Ver alunos da turma ${esc(t.codigo)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   stroke-width="2" width="12" height="12" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35"/>
              </svg>
              Alunos
            </button>
          </td>
        </tr>`;
    }).join('');

    tableHtml = `
      <div class="table-wrap">
        <div class="table-toolbar">
          <span style="font-size:12.5px;color:var(--text-secondary);
                       font-family:var(--font-mono)">
            ${nTotal} turma${nTotal !== 1 ? 's' : ''} encontrada${nTotal !== 1 ? 's' : ''}
          </span>
        </div>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Curso</th>
                <th>Alunos</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  detail.innerHTML = `
    <button class="btn btn-secondary inst-back-btn" aria-label="Voltar à lista de instrutores">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" width="14" height="14" aria-hidden="true">
        <line x1="19" y1="12" x2="5" y2="12"/>
        <polyline points="12 19 5 12 12 5"/>
      </svg>
      Voltar
    </button>
  ` + header + tableHtml;

  // Botão voltar (mobile)
  detail.querySelector('.inst-back-btn')?.addEventListener('click', () => {
    _activeId = null;
    document.querySelectorAll('.inst-item').forEach(c => {
      c.classList.remove('active');
      c.setAttribute('aria-pressed', 'false');
    });
    document.querySelector('.inst-master-panel')?.classList.remove('mob-hide');
    document.getElementById('inst-detail-panel')?.classList.add('mob-hide');
    document.getElementById('detail-content').innerHTML = _renderDetailEmpty();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── Bind: lupa → modal de alunos por turma ────────────────────────────────
  detail.querySelectorAll('.inst-ver-alunos').forEach(btn =>
    btn.addEventListener('click', () =>
      abrirAlunosDaTurma(btn.dataset.turmaId, btn.dataset.turmaCodigo)
    )
  );
}

// ─── Modal: Alunos matriculados na turma ──────────────────────────────────────
async function abrirAlunosDaTurma(turmaId, turmaCodigo) {
  openModal(`Alunos — Turma ${esc(turmaCodigo)}`, `
    <div style="display:flex;align-items:center;justify-content:center;
                padding:40px;gap:10px;color:var(--text-tertiary);font-size:13px">
      <div class="skeleton"
           style="width:18px;height:18px;border-radius:50%;flex-shrink:0"></div>
      Carregando alunos...
    </div>
  `);

  try {
    const alunos = await loadAlunosDaTurma(turmaId);
    const body   = document.getElementById('modal-body');
    if (!body) return;

    if (!alunos.length) {
      body.innerHTML = `
        <p style="text-align:center;padding:40px;
                  color:var(--text-tertiary);font-size:13px">
          Nenhum aluno matriculado nesta turma.
        </p>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="modal-cancel">Fechar</button>
        </div>`;
      document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
      return;
    }

    // Contadores de status para o resumo
    const counts = alunos.reduce((acc, a) => {
      acc[a.status] = (acc[a.status] || 0) + 1;
      return acc;
    }, {});

    const resumoPills = Object.entries(counts)
      .map(([st, n]) =>
        `<span class="badge ${ALUNO_BADGE[st] ?? 'badge-gray'}">
           ${n} ${ALUNO_LABEL[st] ?? st}
         </span>`)
      .join('');

    body.innerHTML = `
      <!-- Barra de resumo -->
      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;
                  padding:12px 16px;background:var(--bg-elevated);
                  border-bottom:1px solid var(--border-subtle)">
        <span style="font-size:11.5px;color:var(--text-secondary);
                     font-family:var(--font-mono);margin-right:4px">
          ${alunos.length} aluno${alunos.length !== 1 ? 's' : ''}
        </span>
        ${resumoPills}
      </div>

      <!-- Lista de alunos -->
      <div style="max-height:420px;overflow-y:auto">
        ${alunos.map((a, idx) => `
          <div style="display:flex;align-items:center;gap:12px;
                      padding:11px 16px;
                      border-bottom:1px solid var(--border-subtle);
                      ${idx % 2 === 0 ? 'background:var(--bg-base)' : ''}">

            <div style="width:32px;height:32px;border-radius:50%;flex-shrink:0;
                        background:linear-gradient(135deg,var(--accent-soft),var(--blue-soft));
                        border:1px solid var(--border-default);
                        display:grid;place-items:center;
                        font-size:12px;font-weight:600;color:var(--text-primary)"
                 aria-hidden="true">
              ${esc(a.nome.charAt(0).toUpperCase())}
            </div>

            <div style="flex:1;min-width:0">
              <div style="font-weight:500;font-size:13px;
                          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                ${esc(a.nome)}
              </div>
              <div style="font-size:11.5px;color:var(--text-tertiary);
                          font-family:var(--font-mono);margin-top:1px">
                ${esc(a.doc)}
              </div>
            </div>

            <span class="badge ${ALUNO_BADGE[a.status] ?? 'badge-gray'}">
              ${ALUNO_LABEL[a.status] ?? esc(a.status)}
            </span>

          </div>`).join('')}
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">Fechar</button>
      </div>`;

    document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());

  } catch (err) {
    toast(`Erro ao carregar alunos: ${err.message}`, 'error');
    closeModal();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CRUD — Novo / Editar / Excluir Instrutor (sem alterações funcionais)
// ══════════════════════════════════════════════════════════════════════════════

// ─── Modal Instrutor ──────────────────────────────────────────────────────────
function modalInstrutor(inst = null) {
  const isEdit = !!inst;

  let espString = '';
  if (inst) {
    if (Array.isArray(inst.especialidades))          espString = inst.especialidades.join(', ');
    else if (typeof inst.especialidades === 'string') espString = inst.especialidades;
  }

  openModal(isEdit ? 'Editar Instrutor' : 'Novo Instrutor', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Nome Completo <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <input id="f-nome" type="text" value="${inst?.nome || ''}"
               placeholder="Ex: Carlos Eduardo Lima" autocomplete="name">
      </div>
      <div class="form-group">
        <label>E-mail <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <input id="f-email" type="email" value="${inst?.email || ''}"
               placeholder="instrutor@email.com" autocomplete="email" inputmode="email">
      </div>
      <div class="form-group">
        <label>Telefone <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <input id="f-tel" type="text" value="${inst?.telefone || ''}"
               placeholder="(11) 99999-9999" autocomplete="tel" inputmode="tel">
      </div>
      <div class="form-group full">
        <label>Especialidades <span style="color:var(--red)" aria-hidden="true">*</span>
          <span style="font-weight:400;color:var(--text-tertiary)">(separadas por vírgula)</span>
        </label>
        <input id="f-esp" type="text" value="${espString}"
               placeholder="Ex: NR-35, NR-33, Primeiros Socorros">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary"   id="modal-save">
        ${isEdit ? 'Salvar Alterações' : 'Criar Instrutor'}
      </button>
    </div>
  `);

  bindBlur('f-nome',  'Nome',           ['required']);
  bindBlur('f-email', 'E-mail',         ['required', 'email']);
  bindBlur('f-tel',   'Telefone',       ['required', 'phone']);
  bindBlur('f-esp',   'Especialidades', ['required']);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click',   () => saveInstrutor(inst?.id));
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function saveInstrutor(id) {
  const nome   = document.getElementById('f-nome').value.trim();
  const email  = document.getElementById('f-email').value.trim();
  const tel    = document.getElementById('f-tel').value.trim();
  const espRaw = document.getElementById('f-esp').value.trim();

  const ok = validateForm([
    { id: 'f-nome',  value: nome,   rules: ['required'],          label: 'Nome' },
    { id: 'f-email', value: email,  rules: ['required', 'email'], label: 'E-mail' },
    { id: 'f-tel',   value: tel,    rules: ['required', 'phone'], label: 'Telefone' },
    { id: 'f-esp',   value: espRaw, rules: ['required'],          label: 'Especialidades' },
  ]);
  if (!ok) return;

  const especialidades = espRaw.split(',').map(s => s.trim()).filter(Boolean);

  const payload = {
    tenant_id: getTenantId(),
    nome, email,
    telefone:      tel,
    especialidades,
  };

  const btn = document.getElementById('modal-save');
  btn.disabled    = true;
  btn.textContent = 'Salvando...';

  try {
    let error;
    if (id) {
      ({ error } = await supabase
        .from('instrutores').update(payload)
        .eq('id', id).eq('tenant_id', getTenantId()));
    } else {
      ({ error } = await supabase.from('instrutores').insert(payload));
    }
    if (error) throw error;
    closeModal();
    toast(id ? 'Instrutor atualizado!' : 'Instrutor cadastrado!', 'success');
    await loadData();
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar instrutor', 'error');
    btn.disabled    = false;
    btn.textContent = id ? 'Salvar Alterações' : 'Criar Instrutor';
  }
}

// ─── Excluir Instrutor ────────────────────────────────────────────────────────
function confirmarExclusaoInstrutor(inst) {
  openModal('Excluir Instrutor', `
    <div class="danger-banner">
      <div class="danger-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" width="22" height="22">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
      </div>
      <div class="danger-banner-info">
        <div class="danger-banner-title">Excluir instrutor permanentemente</div>
        <div class="danger-banner-sub">${esc(inst.nome)}</div>
      </div>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.6">
      Esta ação é irreversível. Turmas vinculadas a este instrutor
      <strong style="color:var(--red)">perderão o vínculo</strong>.
    </p>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-danger"    id="btn-confirmar-exclusao">Excluir Instrutor</button>
    </div>
  `);
  document.getElementById('modal-cancel')
    ?.addEventListener('click', () => closeModal());
  document.getElementById('btn-confirmar-exclusao')
    ?.addEventListener('click', () => excluirInstrutor(inst.id));
}

async function excluirInstrutor(id) {
  const btn = document.getElementById('btn-confirmar-exclusao');
  btn.disabled    = true;
  btn.textContent = 'Excluindo...';
  try {
    const { error } = await supabase
      .from('instrutores').delete()
      .eq('id', id).eq('tenant_id', getTenantId());
    if (error) throw error;

    // Se o instrutor excluído era o selecionado, limpa o detail
    if (_activeId === id) {
      _activeId = null;
      const detail = document.getElementById('detail-content');
      if (detail) detail.innerHTML = _renderDetailEmpty();
    }

    closeModal();
    toast('Instrutor excluído com sucesso.', 'success');
    await loadData();
  } catch (err) {
    toast(`Erro ao excluir: ${err.message}`, 'error');
    btn.disabled    = false;
    btn.textContent = 'Excluir Instrutor';
  }
}
