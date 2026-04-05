/**
 * /js/views/cursos.js
 * CRUD real para Cursos via Supabase.
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast, fmtMoney } from '../ui/components.js';

let _cache = [];

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Cursos</h1><p>Catálogo de cursos e treinamentos</p></div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-novo-curso">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Curso
        </button>
      </div>
    </div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-cursos" placeholder="Buscar por curso ou código...">
        </div>
      </div>
      <table>
        <thead><tr><th>Curso</th><th>Código</th><th>Carga Hor.</th><th>Validade</th><th>Valor Padrão</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody id="cursos-tbody">
          <tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-tertiary)"><div class="skeleton" style="width:16px;height:16px;border-radius:50%;display:inline-block;vertical-align:middle;margin-right:8px"></div> Carregando...</td></tr>
        </tbody>
      </table>
    </div>
  `);

  document.getElementById('btn-novo-curso')?.addEventListener('click', () => modalCurso());
  document.getElementById('search-cursos')?.addEventListener('input', applyFilter);

  await loadData();
}

async function loadData() {
  try {
    const { data, error } = await supabase
      .from('cursos')
      .select('*')
      .eq('tenant_id', getTenantId())
      .order('nome');
      
    if (error) throw error;
    _cache = data || [];
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar cursos', 'error');
    _cache = [];
  }
  applyFilter();
}

function applyFilter() {
  const q = document.getElementById('search-cursos')?.value.toLowerCase().trim() || '';
  const filtered = _cache.filter(c => 
    c.nome.toLowerCase().includes(q) || 
    (c.codigo && c.codigo.toLowerCase().includes(q))
  );
  renderTabela(filtered);
}

function renderTabela(cursos) {
  const tbody = document.getElementById('cursos-tbody');
  if (!tbody) return;

  if (cursos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-tertiary)">Nenhum curso encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = cursos.map(c => `
    <tr>
      <td style="font-weight:500">${c.nome}</td>
      <td><span style="font-family:var(--font-mono);font-size:12px;color:var(--accent)">${c.codigo || '—'}</span></td>
      <td style="font-size:12.5px">${c.carga_horaria ? c.carga_horaria + 'h' : '—'}</td>
      <td style="font-size:12.5px">${c.validade_meses ? c.validade_meses + ' meses' : '—'}</td>
      <td style="font-family:var(--font-mono);font-size:12.5px;color:var(--green)">${c.valor_padrao ? fmtMoney(c.valor_padrao) : '—'}</td>
      <td><span class="badge ${c.ativo !== false ? 'badge-green' : 'badge-gray'}">${c.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <button class="action-btn" data-action="editar" data-id="${c.id}">Editar</button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.action-btn[data-action="editar"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const curso = _cache.find(cx => cx.id == btn.dataset.id);
      if (curso) modalCurso(curso);
    });
  });
}

function modalCurso(curso = null) {
  const isEdit = !!curso;
  openModal(isEdit ? 'Editar Curso' : 'Novo Curso', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Nome do Curso *</label>
        <input id="f-nome" type="text" value="${curso?.nome || ''}" placeholder="Ex: NR-35 Trabalho em Altura">
      </div>
      <div class="form-group">
        <label>Código (Sigla) *</label>
        <input id="f-cod" type="text" value="${curso?.codigo || ''}" placeholder="Ex: NR35">
      </div>
      <div class="form-group">
        <label>Carga Horária (h) *</label>
        <input id="f-ch" type="number" value="${curso?.carga_horaria || ''}" placeholder="Ex: 8">
      </div>
      <div class="form-group">
        <label>Validade (meses)</label>
        <input id="f-val" type="number" value="${curso?.validade_meses || ''}" placeholder="Ex: 24">
      </div>
      <div class="form-group">
        <label>Valor Padrão (R$) *</label>
        <input id="f-valor" type="number" value="${curso?.valor_padrao || ''}" step="0.01" placeholder="0.00">
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="f-ativo">
          <option value="true" ${curso?.ativo !== false ? 'selected' : ''}>Ativo</option>
          <option value="false" ${curso?.ativo === false ? 'selected' : ''}>Inativo</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Salvar Alterações' : 'Criar Curso'}</button>
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => saveCurso(curso?.id));
}

async function saveCurso(id) {
  const nome = document.getElementById('f-nome').value.trim();
  const cod = document.getElementById('f-cod').value.trim();
  const ch = parseInt(document.getElementById('f-ch').value) || null;
  const validade = parseInt(document.getElementById('f-val').value) || null;
  const valor = parseFloat(document.getElementById('f-valor').value) || null;
  const ativo = document.getElementById('f-ativo').value === 'true';

  if (!nome) {
    toast('O nome do curso é obrigatório.', 'warning');
    return;
  }

  const payload = {
    tenant_id: getTenantId(),
    nome,
    codigo: cod || null,
    carga_horaria: ch,
    validade_meses: validade,
    valor_padrao: valor,
    ativo
  };

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    let error;
    if (id) {
      const res = await supabase.from('cursos').update(payload).eq('id', id).eq('tenant_id', getTenantId());
      error = res.error;
    } else {
      const res = await supabase.from('cursos').insert(payload);
      error = res.error;
    }

    if (error) throw error;

    closeModal();
    toast(id ? 'Curso atualizado!' : 'Curso criado!', 'success');
    await loadData();
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar curso', 'error');
    btn.disabled = false;
    btn.textContent = id ? 'Salvar Alterações' : 'Criar Curso';
  }
}
