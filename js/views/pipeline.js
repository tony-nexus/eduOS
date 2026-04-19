/**
 * /js/views/pipeline.js
 * Pipeline Operacional — Master-Detail Layout
 *
 * Padrão:
 *   ┌──────────────────┬──────────────────────────────────────────┐
 *   │  MASTER (~35%)   │  DETAIL (~65%)                           │
 *   │  Lista de turmas │  Kanban da turma selecionada             │
 *   └──────────────────┴──────────────────────────────────────────┘
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, toast, esc, fmtDate } from '../ui/components.js';
import { navigate } from '../core/router.js';

let _turmas        = [];
let _matriculas    = [];   // matrículas da turma ativa
let _activeId      = null; // turma selecionada
let _refreshTimer  = null; // ID do setInterval de auto-refresh
const REFRESH_INTERVAL_MS = 30_000; // 30 segundos

const STATUS_TURMA_BADGE = {
  agendada:     'badge-blue',
  em_andamento: 'badge-amber',
  concluida:    'badge-green',
  cancelada:    'badge-red',
};
const STATUS_TURMA_LABEL = {
  agendada:     'Agendada',
  em_andamento: 'Em Andamento',
  concluida:    'Concluída',
  cancelada:    'Cancelada',
};

const KANBAN_COLS = [
  { key: 'matriculado',         label: 'Matriculados',  color: 'var(--blue)'   },
  { key: 'em_andamento',        label: 'Em Andamento',  color: 'var(--accent)' },
  { key: 'reprovado',           label: 'Reprovados',    color: 'var(--red)'    },
  { key: 'concluido',           label: 'Concluído',     color: 'var(--green)'  },
  { key: 'certificado_emitido', label: 'Cert. Emitido', color: 'var(--purple)' },
];

// Transições de status válidas (dentro da turma)
const TRANSICOES = {
  matriculado:         ['em_andamento', 'cancelado'],
  em_andamento:        ['concluido', 'reprovado', 'cancelado'],
  reprovado:           ['em_andamento', 'cancelado'],
  concluido:           ['certificado_emitido'],
  certificado_emitido: [],
};

function _isMobile() { return window.innerWidth <= 768; }

// ─── Limpa timer ao sair da página ───────────────────────────────────────────
function stopRefresh() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}

function startRefresh() {
  stopRefresh();
  _refreshTimer = setInterval(async () => {
    // Atualiza silenciosamente a turma ativa (sem esqueleto)
    if (_activeId) {
      try {
        const { data, error } = await supabase
          .from('matriculas')
          .select('id, status, aluno:aluno_id(nome), curso:curso_id(nome)')
          .eq('tenant_id', getTenantId())
          .eq('turma_id', _activeId);
        if (!error && data) {
          _matriculas = data;
          const turma = _turmas.find(t => t.id === _activeId);
          if (turma) renderDetailPanel(turma, _matriculas);
        }
      } catch (_) { /* silencioso */ }
    }
    // Atualiza contadores do master (vagas ocupadas podem ter mudado)
    try {
      const { data } = await supabase
        .from('turmas')
        .select('id, status, vagas, ocupadas')
        .eq('tenant_id', getTenantId());
      if (data) {
        data.forEach(t => {
          const cached = _turmas.find(c => c.id === t.id);
          if (cached) {
            cached.status   = t.status;
            cached.vagas    = t.vagas;
            cached.ocupadas = t.ocupadas;
          }
        });
        // Re-renderiza lista master silenciosamente
        const q    = (document.getElementById('search-turmas-pipe')?.value   || '').toLowerCase();
        const st   = document.getElementById('filter-status-pipe')?.value    || '';
        const cur  = document.getElementById('filter-curso-pipe')?.value     || '';
        const inst = document.getElementById('filter-instrutor-pipe')?.value || '';
        const de   = document.getElementById('filter-periodo-de')?.value     || '';
        const ate  = document.getElementById('filter-periodo-ate')?.value    || '';
        renderMasterList(_turmas.filter(t => {
          if (q   && !t.codigo.toLowerCase().includes(q) && !(t.curso_nome ?? '').toLowerCase().includes(q)) return false;
          if (st  && t.status !== st)          return false;
          if (cur && t.curso_id !== cur)       return false;
          if (inst && t.instrutor_id !== inst) return false;
          if (de  && t.data_inicio && t.data_inicio < de)  return false;
          if (ate && t.data_inicio && t.data_inicio > ate) return false;
          return true;
        }));
      }
    } catch (_) { /* silencioso */ }

    _updateLastRefresh();
  }, REFRESH_INTERVAL_MS);
}

function _updateLastRefresh() {
  const el = document.getElementById('pipe-last-refresh');
  if (el) el.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Render principal ─────────────────────────────────────────────────────────
export async function render() {
  stopRefresh(); // limpa timer anterior caso o usuário navegue de volta
  _activeId = null;

  setContent(`
    <div class="page-header">
      <div>
        <h1>Pipeline Operacional</h1>
        <p style="display:flex;align-items:center;gap:8px">
          Jornada completa do aluno por turma
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--green)">
            <span style="width:6px;height:6px;border-radius:50%;background:var(--green);animation:pulse 2s infinite"></span>
            Automático
          </span>
          <span id="pipe-last-refresh" style="font-size:11px;color:var(--text-tertiary)"></span>
        </p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-nova-mat-pipeline">Nova Matrícula</button>
      </div>
    </div>

    <div class="pipe-layout">

      <!-- ── MASTER: lista de turmas ──────────────────────────────── -->
      <div class="pipe-master-panel">
        <div class="table-wrap" style="padding:0;overflow:hidden">
          <!-- Filtros -->
          <div style="padding:10px 12px;border-bottom:1px solid var(--border-subtle)">

            <!-- Busca -->
            <div class="search-input-wrap" style="margin-bottom:8px">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input class="search-input" id="search-turmas-pipe" placeholder="Código ou curso..." aria-label="Buscar turma">
            </div>

            <!-- Status + Curso em grid 2 colunas -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
              <div>
                <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:3px;font-weight:500;text-transform:uppercase;letter-spacing:.04em">Status</div>
                <select class="select-input" id="filter-status-pipe" style="font-size:12px;width:100%;padding:5px 6px">
                  <option value="">Todos</option>
                  <option value="agendada">Agendada</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="concluida">Concluída</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
              <div>
                <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:3px;font-weight:500;text-transform:uppercase;letter-spacing:.04em">Curso</div>
                <select class="select-input" id="filter-curso-pipe" style="font-size:12px;width:100%;padding:5px 6px">
                  <option value="">Todos</option>
                </select>
              </div>
            </div>

            <!-- Instrutor (linha inteira) -->
            <div style="margin-bottom:6px">
              <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:3px;font-weight:500;text-transform:uppercase;letter-spacing:.04em">Instrutor</div>
              <select class="select-input" id="filter-instrutor-pipe" style="font-size:12px;width:100%;padding:5px 6px">
                <option value="">Todos</option>
              </select>
            </div>

            <!-- Período em grid 2 colunas -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <div>
                <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:3px;font-weight:500;text-transform:uppercase;letter-spacing:.04em">De</div>
                <input type="date" class="select-input" id="filter-periodo-de" style="font-size:12px;width:100%;padding:5px 6px">
              </div>
              <div>
                <div style="font-size:10px;color:var(--text-tertiary);margin-bottom:3px;font-weight:500;text-transform:uppercase;letter-spacing:.04em">Até</div>
                <input type="date" class="select-input" id="filter-periodo-ate" style="font-size:12px;width:100%;padding:5px 6px">
              </div>
            </div>

          </div>
          <div id="pipe-turma-list" style="padding:10px 10px 4px;max-height:calc(100vh - 260px);overflow-y:auto">
            ${Array(3).fill('<div class="skeleton" style="height:70px;border-radius:6px;margin-bottom:7px"></div>').join('')}
          </div>
          <div style="padding:8px 14px;border-top:1px solid var(--border-subtle)">
            <span class="table-info" id="pipe-turma-count">—</span>
          </div>
        </div>
      </div>

      <!-- ── DETAIL: kanban da turma selecionada ───────────────────── -->
      <div class="pipe-detail-panel" id="pipe-detail-panel">
        <div id="pipe-detail-content">${_renderDetailEmpty()}</div>
      </div>

    </div>
  `);

  document.getElementById('btn-nova-mat-pipeline')?.addEventListener('click', () => navigate('matriculas'));

  // Filtros do master
  const applyMasterFilter = () => {
    const q    = (document.getElementById('search-turmas-pipe')?.value  || '').toLowerCase();
    const st   = document.getElementById('filter-status-pipe')?.value   || '';
    const cur  = document.getElementById('filter-curso-pipe')?.value    || '';
    const inst = document.getElementById('filter-instrutor-pipe')?.value || '';
    const de   = document.getElementById('filter-periodo-de')?.value    || '';
    const ate  = document.getElementById('filter-periodo-ate')?.value   || '';

    renderMasterList(_turmas.filter(t => {
      if (q   && !t.codigo.toLowerCase().includes(q) && !(t.curso_nome ?? '').toLowerCase().includes(q)) return false;
      if (st  && t.status !== st)          return false;
      if (cur && t.curso_id !== cur)       return false;
      if (inst && t.instrutor_id !== inst) return false;
      if (de  && t.data_inicio && t.data_inicio < de)  return false;
      if (ate && t.data_inicio && t.data_inicio > ate) return false;
      return true;
    }));
  };

  ['search-turmas-pipe','filter-status-pipe','filter-curso-pipe',
   'filter-instrutor-pipe','filter-periodo-de','filter-periodo-ate'].forEach(id => {
    const el = document.getElementById(id);
    el?.addEventListener(id === 'search-turmas-pipe' ? 'input' : 'change', applyMasterFilter);
  });

  if (_isMobile()) {
    document.getElementById('pipe-detail-panel')?.classList.add('mob-hide');
  }

  await loadTurmas();
}

// ─── Fetch turmas ─────────────────────────────────────────────────────────────
async function loadTurmas() {
  try {
    const { data, error } = await supabase
      .from('turmas')
      .select('id, codigo, curso_id, instrutor_id, status, vagas, ocupadas, data_inicio, data_fim, curso:curso_id(nome), instrutor:instrutor_id(nome)')
      .eq('tenant_id', getTenantId())
      .order('data_inicio', { ascending: false });

    if (error) throw error;
    _turmas = (data || []).map(t => ({
      ...t,
      curso_nome:     t.curso?.nome     ?? '—',
      instrutor_nome: t.instrutor?.nome ?? null,
    }));
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar turmas', 'error');
    _turmas = [];
  }
  _populateMasterFilters();
  renderMasterList(_turmas);
  _updateLastRefresh();
  startRefresh();
}

function _populateMasterFilters() {
  const cursos     = [...new Map(_turmas.filter(t => t.curso_id).map(t => [t.curso_id, t.curso_nome])).entries()];
  const instrutores = [...new Map(_turmas.filter(t => t.instrutor_id).map(t => [t.instrutor_id, t.instrutor_nome])).entries()];

  const selCurso = document.getElementById('filter-curso-pipe');
  const selInst  = document.getElementById('filter-instrutor-pipe');
  if (selCurso) selCurso.innerHTML = '<option value="">Todos os cursos</option>' +
    cursos.map(([id, nome]) => `<option value="${id}">${esc(nome)}</option>`).join('');
  if (selInst) selInst.innerHTML = '<option value="">Todos os instrutores</option>' +
    instrutores.map(([id, nome]) => `<option value="${id}">${esc(nome)}</option>`).join('');
}

// ─── Render lista master ──────────────────────────────────────────────────────
function renderMasterList(list) {
  const el    = document.getElementById('pipe-turma-list');
  const count = document.getElementById('pipe-turma-count');
  if (!el) return;

  if (count) count.textContent = `${list.length} turma${list.length !== 1 ? 's' : ''}`;

  if (!list.length) {
    el.innerHTML = `<p style="text-align:center;padding:28px 12px;color:var(--text-tertiary);font-size:13px">Nenhuma turma encontrada.</p>`;
    return;
  }

  el.innerHTML = list.map(t => {
    const pct      = t.vagas > 0 ? Math.round((t.ocupadas ?? 0) / t.vagas * 100) : 0;
    const pctColor = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--accent)';
    const isActive = t.id === _activeId;
    return `
      <div class="inst-item${isActive ? ' active' : ''}"
           data-id="${t.id}" role="button" tabindex="0" aria-pressed="${isActive}">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap">
            <span class="inst-item-name">${esc(t.codigo)}</span>
            <span class="badge ${STATUS_TURMA_BADGE[t.status] ?? 'badge-gray'}"
                  style="font-size:10px;padding:1px 6px">
              ${STATUS_TURMA_LABEL[t.status] ?? t.status}
            </span>
          </div>
          <div class="inst-item-meta">${esc(t.curso_nome)}${t.instrutor_nome ? ` · <span style="color:var(--text-tertiary)">${esc(t.instrutor_nome)}</span>` : ''}</div>
          <div style="margin-top:5px;display:flex;align-items:center;gap:8px">
            <div class="progress-bar" style="flex:1;height:3px">
              <div class="progress-fill" style="width:${pct}%;background:${pctColor}"></div>
            </div>
            <span style="font-size:10.5px;color:var(--text-tertiary);font-family:var(--font-mono);flex-shrink:0">
              ${t.ocupadas ?? 0}/${t.vagas}
            </span>
          </div>
          <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:2px">
            ${t.data_inicio ? fmtDate(t.data_inicio) : '—'}${t.data_fim ? ' → ' + fmtDate(t.data_fim) : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  el.querySelectorAll('.inst-item').forEach(card => {
    card.addEventListener('click', () => selecionarTurma(card.dataset.id));
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selecionarTurma(card.dataset.id); }
    });
  });
}

// ─── Selecionar turma → carrega kanban ───────────────────────────────────────
async function selecionarTurma(id) {
  _activeId = id;

  // Atualiza estado visual
  document.querySelectorAll('#pipe-turma-list .inst-item').forEach(card => {
    const active = card.dataset.id === id;
    card.classList.toggle('active', active);
    card.setAttribute('aria-pressed', String(active));
  });

  // Mobile: alterna painéis
  if (_isMobile()) {
    document.querySelector('.pipe-master-panel')?.classList.add('mob-hide');
    document.getElementById('pipe-detail-panel')?.classList.remove('mob-hide');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Skeleton
  const detailContent = document.getElementById('pipe-detail-content');
  if (detailContent) {
    detailContent.innerHTML = `
      <div style="min-height:300px;display:flex;align-items:center;justify-content:center;
                  border:1px solid var(--border-subtle);border-radius:var(--radius-md);
                  background:var(--bg-surface)">
        <div style="display:flex;align-items:center;gap:10px;color:var(--text-tertiary);font-size:13px">
          <div class="skeleton" style="width:18px;height:18px;border-radius:50%;flex-shrink:0"></div>
          Carregando pipeline...
        </div>
      </div>`;
  }

  const turma = _turmas.find(t => t.id === id);
  if (!turma) return;

  try {
    const { data, error } = await supabase
      .from('matriculas')
      .select('id, status, aluno:aluno_id(nome), curso:curso_id(nome)')
      .eq('tenant_id', getTenantId())
      .eq('turma_id', id);
    if (error) throw error;
    _matriculas = data || [];
    renderDetailPanel(turma, _matriculas);
  } catch (err) {
    toast(`Erro ao carregar pipeline: ${err.message}`, 'error');
    if (detailContent) detailContent.innerHTML = _renderDetailEmpty();
  }
}

// ─── Estado vazio do detail ───────────────────────────────────────────────────
function _renderDetailEmpty() {
  return `
    <div class="inst-detail-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" width="56" height="56">
        <rect x="3" y="3" width="5" height="18" rx="1"/>
        <rect x="10" y="3" width="5" height="12" rx="1"/>
        <rect x="17" y="3" width="5" height="15" rx="1"/>
      </svg>
      <div style="font-weight:600;font-size:14px;color:var(--text-secondary)">Nenhuma turma selecionada</div>
      <div>Clique em uma turma na lista ao lado para visualizar o pipeline de matrículas.</div>
    </div>`;
}

// ─── Render painel de detalhe (kanban) ────────────────────────────────────────
function renderDetailPanel(turma, matriculas) {
  const detailContent = document.getElementById('pipe-detail-content');
  if (!detailContent) return;

  const pct      = turma.vagas > 0 ? Math.round((turma.ocupadas ?? 0) / turma.vagas * 100) : 0;
  const pctColor = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--accent)';

  // Header da turma
  const header = `
    <div class="card" style="padding:14px 18px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:15px;font-family:var(--font-mono)">
              ${esc(turma.codigo)}
            </span>
            <span class="badge ${STATUS_TURMA_BADGE[turma.status] ?? 'badge-gray'}">
              ${STATUS_TURMA_LABEL[turma.status] ?? turma.status}
            </span>
          </div>
          <div style="font-size:12.5px;color:var(--text-tertiary)">${esc(turma.curso_nome)}</div>
        </div>
        <div style="display:flex;gap:20px;text-align:center;flex-shrink:0;align-items:center">
          <div>
            <div style="font-size:20px;font-weight:700;color:var(--blue);line-height:1">${matriculas.length}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:2px">Matrículas</div>
          </div>
          <div>
            <div style="font-size:14px;font-weight:600;color:${pctColor};line-height:1;font-family:var(--font-mono)">${turma.ocupadas ?? 0}/${turma.vagas}</div>
            <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:2px">Vagas</div>
          </div>
        </div>
      </div>
    </div>`;

  // Kanban
  const cols = KANBAN_COLS.map(c => {
    const items = matriculas.filter(m => m.status === c.key);
    return { ...c, items };
  });

  const kanban = `
    <div class="kanban-board pipe-kanban-detail" id="kanban-board">
      ${cols.map(c => `
        <div class="kanban-col" data-status="${c.key}">
          <div class="kanban-col-header">
            <span class="kanban-col-title">
              <span class="dot" style="background:${c.color}"></span>
              ${c.label}
            </span>
            <span class="kanban-col-count">${c.items.length}</span>
          </div>
          <div class="kanban-col-body" data-status="${c.key}">
            ${c.items.map(m => `
              <div class="kanban-card" draggable="true" data-id="${m.id}"
                   data-nome="${esc(m.aluno?.nome || '—')}">
                <div class="kanban-card-name">${esc(m.aluno?.nome || '—')}</div>
                <div class="kanban-card-meta">
                  <span class="badge badge-gray" style="font-size:10px">${esc(m.curso?.nome || '—')}</span>
                </div>
              </div>
            `).join('')}
            ${c.items.length === 0
              ? '<div style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:10px 0">Vazio</div>'
              : ''}
          </div>
        </div>
      `).join('')}
    </div>`;

  detailContent.innerHTML = `
    <button class="btn btn-secondary inst-back-btn" aria-label="Voltar à lista de turmas">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <line x1="19" y1="12" x2="5" y2="12"/>
        <polyline points="12 19 5 12 12 5"/>
      </svg>
      Voltar
    </button>
  ` + header + kanban;

  // Botão voltar (mobile)
  detailContent.querySelector('.inst-back-btn')?.addEventListener('click', () => {
    _activeId = null;
    document.querySelectorAll('#pipe-turma-list .inst-item').forEach(c => {
      c.classList.remove('active');
      c.setAttribute('aria-pressed', 'false');
    });
    document.querySelector('.pipe-master-panel')?.classList.remove('mob-hide');
    document.getElementById('pipe-detail-panel')?.classList.add('mob-hide');
    document.getElementById('pipe-detail-content').innerHTML = _renderDetailEmpty();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  setupDragAndDrop(turma);
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────────
function setupDragAndDrop(turma) {
  const cards   = document.querySelectorAll('#pipe-detail-content .kanban-card');
  const columns = document.querySelectorAll('#pipe-detail-content .kanban-col-body');

  cards.forEach(card => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend',   () => card.classList.remove('dragging'));
  });

  columns.forEach(col => {
    col.addEventListener('dragover',  e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));

    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');

      const draggingCard = document.querySelector('#pipe-detail-content .dragging');
      if (!draggingCard) return;

      const newStatus = col.dataset.status;
      const cardId    = draggingCard.dataset.id;

      const matricula = _matriculas.find(m => m.id == cardId);
      if (!matricula || matricula.status === newStatus) return;

      // Valida transição
      const permitidas = TRANSICOES[matricula.status] ?? [];
      if (!permitidas.includes(newStatus)) {
        toast(`Transição inválida: ${matricula.status} → ${newStatus}`, 'warning');
        return;
      }

      // Valida vagas ao entrar em estados ativos
      if (['matriculado', 'em_andamento'].includes(newStatus) &&
          !['matriculado', 'em_andamento', 'aguardando_turma'].includes(matricula.status)) {
        if ((turma.ocupadas ?? 0) >= turma.vagas) {
          toast('Turma sem vagas disponíveis.', 'warning');
          return;
        }
      }

      const oldStatus  = matricula.status;
      matricula.status = newStatus;

      // Re-render otimista
      renderDetailPanel(turma, _matriculas);

      try {
        const { error } = await supabase
          .from('matriculas')
          .update({ status: newStatus })
          .eq('id', cardId)
          .eq('tenant_id', getTenantId());

        if (error) throw error;
        toast(`${esc(draggingCard.dataset.nome)} → ${newStatus.replace(/_/g, ' ')}`, 'success');
      } catch (err) {
        matricula.status = oldStatus;
        renderDetailPanel(turma, _matriculas);
        toast('Erro ao alterar status.', 'error');
      }
    });
  });
}
