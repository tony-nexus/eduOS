/**
 * /js/views/pipeline.js
 * Kanban alimentado pela tabela de matriculas do Supabase.
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, toast } from '../ui/components.js';
import { navigate } from '../core/router.js';

let _matriculas = [];

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Pipeline Operacional</h1><p>Jornada completa do aluno</p></div>
      <div class="page-header-actions">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input type="text" id="search-pipeline" class="search-input" placeholder="Buscar aluno...">
        </div>
        <button class="btn btn-primary" id="btn-nova-mat-pipeline">Nova Matrícula</button>
      </div>
    </div>
    <div class="kanban-board" id="kanban-board">
      <div style="padding:40px;text-align:center;width:100%;color:var(--text-tertiary)">Carregando pipeline...</div>
    </div>
  `);

  document.getElementById('btn-nova-mat-pipeline')?.addEventListener('click', () => navigate('matriculas'));
  document.getElementById('search-pipeline')?.addEventListener('input', (e) => {
    renderKanban(e.target.value);
  });
  await loadData();
}

async function loadData() {
  try {
    const { data, error } = await supabase
      .from('matriculas')
      .select('*, aluno:aluno_id(nome), curso:curso_id(nome)')
      .eq('tenant_id', getTenantId());

    if (error) throw error;
    _matriculas = data || [];
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar pipeline', 'error');
    _matriculas = [];
  }
  renderKanban();
}

function renderKanban(searchTerm = '') {
  const board = document.getElementById('kanban-board');
  if(!board) return;

  const term = searchTerm.trim().toLowerCase();

  const cols = [
    { key: 'matriculado', label: 'Matriculados', color: 'var(--blue)', items: [] },
    { key: 'aguardando_turma', label: 'Aguardando Turma', color: 'var(--amber)', items: [] },
    { key: 'em_andamento', label: 'Em Andamento', color: 'var(--accent)', items: [] },
    { key: 'concluido', label: 'Concluído', color: 'var(--green)', items: [] },
    { key: 'certificado_emitido', label: 'Cert. Emitido', color: 'var(--purple)', items: [] },
    { key: 'outros', label: 'Outros / Sem Status', color: 'var(--text-tertiary)', items: [] },
  ];

  _matriculas.forEach(m => {
    const nome = (m.aluno?.nome || '').toLowerCase();
    if (term && !nome.includes(term)) return;

    const col = cols.find(c => c.key === m.status);
    if (col) {
      col.items.push(m);
    } else {
      cols[5].items.push(m);
    }
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
          <div class="kanban-card" draggable="true" data-id="${m.id}" data-nome="${m.aluno?.nome||'—'}" data-curso="${m.curso?.nome||'—'}">
            <div class="kanban-card-name">${m.aluno?.nome || '—'}</div>
            <div class="kanban-card-meta">
              <span class="badge badge-gray" style="font-size:10px">${m.curso?.nome || '—'}</span>
            </div>
          </div>
        `).join('')}
        ${c.items.length === 0 ? '<div style="font-size:11px; color:var(--text-tertiary); text-align:center; padding:10px 0;">Vazio</div>' : ''}
      </div>
    </div>
  `).join('');

  setupDragAndDrop();
}

function setupDragAndDrop() {
  const cards = document.querySelectorAll('.kanban-card');
  const columns = document.querySelectorAll('.kanban-col-body');
  
  cards.forEach(card => {
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
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
      const cardId = draggingCard.dataset.id;
      
      const matricula = _matriculas.find(m => m.id == cardId);
      if(matricula && matricula.status !== newStatus) {
        const oldStatus = matricula.status;
        matricula.status = newStatus;
        
        // Optimistic UI updates
        const searchInput = document.getElementById('search-pipeline');
        renderKanban(searchInput ? searchInput.value : '');

        try {
          const { error } = await supabase
            .from('matriculas')
            .update({ status: newStatus })
            .eq('id', cardId);
            
          if (error) throw error;
          toast('Alocado com sucesso!', 'success');
        } catch(err) {
          console.error(err);
          // Revert on error
          matricula.status = oldStatus;
          renderKanban(searchInput ? searchInput.value : '');
          toast('Erro ao alterar status.', 'error');
        }
      }
    });
  });
}
