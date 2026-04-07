/**
 * /js/views/pipeline.js
 * Kanban alimentado pela tabela de matriculas do Supabase.
 * Filtros: aluno, turma, curso, status da turma, data início (de/até)
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, toast, esc } from '../ui/components.js';
import { navigate } from '../core/router.js';

let _matriculas  = [];
let _turmasList  = [];
let _cursosList  = [];

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Pipeline Operacional</h1><p>Jornada completa do aluno</p></div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-nova-mat-pipeline">Nova Matrícula</button>
      </div>
    </div>
    <div class="table-toolbar" style="flex-wrap:wrap;gap:8px;margin-bottom:16px">
      <div class="search-input-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="filter-aluno" class="search-input" placeholder="Buscar aluno...">
      </div>
      <select class="select-input" id="filter-turma" style="min-width:140px">
        <option value="">Todas as turmas</option>
      </select>
      <select class="select-input" id="filter-curso" style="min-width:140px">
        <option value="">Todos os cursos</option>
      </select>
      <select class="select-input" id="filter-status-turma">
        <option value="">Status da turma</option>
        <option value="agendada">Agendada</option>
        <option value="em_andamento">Em Andamento</option>
        <option value="concluida">Concluída</option>
        <option value="cancelada">Cancelada</option>
      </select>
      <div style="display:flex;align-items:center;gap:4px">
        <span style="font-size:11.5px;color:var(--text-tertiary);white-space:nowrap">Início de</span>
        <input type="date" class="select-input" id="filter-data-de" style="width:auto">
        <span style="font-size:11.5px;color:var(--text-tertiary)">até</span>
        <input type="date" class="select-input" id="filter-data-ate" style="width:auto">
      </div>
    </div>
    <div class="kanban-board" id="kanban-board">
      <div style="padding:40px;text-align:center;width:100%;color:var(--text-tertiary)">Carregando pipeline...</div>
    </div>
  `);

  document.getElementById('btn-nova-mat-pipeline')?.addEventListener('click', () => navigate('matriculas'));

  ['filter-aluno','filter-turma','filter-curso','filter-status-turma','filter-data-de','filter-data-ate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input',  applyFilters);
      el.addEventListener('change', applyFilters);
    }
  });

  await loadData();
}

async function loadData() {
  try {
    const [mRes, tRes, cRes] = await Promise.all([
      supabase
        .from('matriculas')
        .select('*, aluno:aluno_id(nome), curso:curso_id(id,nome), turma:turma_id(id,codigo,status,data_inicio,data_fim)')
        .eq('tenant_id', getTenantId()),
      supabase
        .from('turmas')
        .select('id, codigo, status, data_inicio, data_fim')
        .eq('tenant_id', getTenantId())
        .order('codigo'),
      supabase
        .from('cursos')
        .select('id, nome')
        .eq('tenant_id', getTenantId())
        .eq('ativo', true)
        .order('nome'),
    ]);

    if (mRes.error) throw mRes.error;
    _matriculas = mRes.data || [];
    _turmasList = tRes.data  || [];
    _cursosList = cRes.data  || [];
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar pipeline', 'error');
    _matriculas = [];
  }

  // Preenche dropdowns de filtro
  const selTurma = document.getElementById('filter-turma');
  if (selTurma) _turmasList.forEach(t => {
    selTurma.innerHTML += `<option value="${t.id}">${esc(t.codigo)}</option>`;
  });

  const selCurso = document.getElementById('filter-curso');
  if (selCurso) _cursosList.forEach(c => {
    selCurso.innerHTML += `<option value="${c.id}">${esc(c.nome)}</option>`;
  });

  applyFilters();
}

function applyFilters() {
  const aluno       = (document.getElementById('filter-aluno')?.value || '').trim().toLowerCase();
  const turmaId     = document.getElementById('filter-turma')?.value || '';
  const cursoId     = document.getElementById('filter-curso')?.value || '';
  const statusTurma = document.getElementById('filter-status-turma')?.value || '';
  const dataDe      = document.getElementById('filter-data-de')?.value || '';
  const dataAte     = document.getElementById('filter-data-ate')?.value || '';

  const filtered = _matriculas.filter(m => {
    if (aluno       && !(m.aluno?.nome || '').toLowerCase().includes(aluno))    return false;
    if (turmaId     && m.turma_id !== turmaId)                                  return false;
    if (cursoId     && m.curso?.id !== cursoId)                                 return false;
    if (statusTurma && m.turma?.status !== statusTurma)                         return false;
    if (dataDe      && m.turma?.data_inicio && m.turma.data_inicio < dataDe)    return false;
    if (dataAte     && m.turma?.data_inicio && m.turma.data_inicio > dataAte)   return false;
    return true;
  });

  renderKanban(filtered);
}

function renderKanban(filtered = _matriculas) {
  const board = document.getElementById('kanban-board');
  if (!board) return;

  const cols = [
    { key: 'matriculado',         label: 'Matriculados',     color: 'var(--blue)',          items: [] },
    { key: 'aguardando_turma',    label: 'Ag. Turma',        color: 'var(--amber)',          items: [] },
    { key: 'em_andamento',        label: 'Em Andamento',     color: 'var(--accent)',         items: [] },
    { key: 'reprovado',           label: 'Reprovados',       color: 'var(--red)',            items: [] },
    { key: 'concluido',           label: 'Concluído',        color: 'var(--green)',          items: [] },
    { key: 'certificado_emitido', label: 'Cert. Emitido',    color: 'var(--purple)',         items: [] },
    { key: 'outros',              label: 'Outros',           color: 'var(--text-tertiary)',  items: [] },
  ];

  filtered.forEach(m => {
    const col = cols.find(c => c.key === m.status);
    (col ?? cols[6]).items.push(m);
  });

  board.innerHTML = cols.map(c => `
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
               data-nome="${esc(m.aluno?.nome||'—')}" data-curso="${esc(m.curso?.nome||'—')}">
            <div class="kanban-card-name">${esc(m.aluno?.nome || '—')}</div>
            <div class="kanban-card-meta" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
              <span class="badge badge-gray" style="font-size:10px">${esc(m.curso?.nome || '—')}</span>
              ${m.turma?.codigo ? `<span style="font-family:var(--font-mono);font-size:10px;color:var(--accent)">${esc(m.turma.codigo)}</span>` : ''}
            </div>
          </div>
        `).join('')}
        ${c.items.length === 0 ? '<div style="font-size:11px;color:var(--text-tertiary);text-align:center;padding:10px 0;">Vazio</div>' : ''}
      </div>
    </div>
  `).join('');

  setupDragAndDrop();
}

function setupDragAndDrop() {
  const cards   = document.querySelectorAll('.kanban-card');
  const columns = document.querySelectorAll('.kanban-col-body');

  cards.forEach(card => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend',   () => card.classList.remove('dragging'));
    card.addEventListener('click', () => {
      toast(`Matrícula selecionada: ${card.dataset.nome}`, 'info');
    });
  });

  columns.forEach(col => {
    col.addEventListener('dragover', e => {
      e.preventDefault();
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));

    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');

      const draggingCard = document.querySelector('.dragging');
      if (!draggingCard) return;

      const newStatus = col.dataset.status;
      const cardId    = draggingCard.dataset.id;

      const matricula = _matriculas.find(m => m.id == cardId);
      if (!matricula || matricula.status === newStatus) return;

      // ── Validação de transições ────────────────────────────────────────────
      const VALIDAS = {
        matriculado:         ['aguardando_turma', 'em_andamento'],
        aguardando_turma:    ['matriculado', 'em_andamento'],
        em_andamento:        ['concluido', 'reprovado'],
        reprovado:           ['aguardando_turma'],
        concluido:           ['certificado_emitido'],
        certificado_emitido: [],   // estado terminal
        outros:              ['matriculado'],
      };
      const permitidas = VALIDAS[matricula.status] ?? [];
      if (!permitidas.includes(newStatus)) {
        toast(`Transição inválida: ${matricula.status} → ${newStatus}`, 'warning');
        return;
      }

      const oldStatus = matricula.status;
      matricula.status = newStatus;
      applyFilters();

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
        applyFilters();
        toast('Erro ao alterar status.', 'error');
      }
    });
  });
}
