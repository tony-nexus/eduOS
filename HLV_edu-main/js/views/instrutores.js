/**
 * /js/views/instrutores.js
 * CRUD real para Instrutores via Supabase.
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast } from '../ui/components.js';

let _cache = [];

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Instrutores</h1><p>Cadastro e vínculo com turmas</p></div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-novo-inst">Novo Instrutor</button>
      </div>
    </div>
    <div id="instrutores-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
      <div class="skeleton" style="height:140px;border-radius:8px"></div>
      <div class="skeleton" style="height:140px;border-radius:8px"></div>
      <div class="skeleton" style="height:140px;border-radius:8px"></div>
    </div>
  `);

  document.getElementById('btn-novo-inst')?.addEventListener('click', () => modalInstrutor());
  await loadData();
}

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
  renderCards(_cache);
}

function renderCards(inst) {
  const grid = document.getElementById('instrutores-grid');
  if (!grid) return;

  if (inst.length === 0) {
    grid.style.display = 'block';
    grid.innerHTML = `<p style="text-align:center;padding:40px;color:var(--text-tertiary)">Nenhum instrutor cadastrado.</p>`;
    return;
  }

  grid.style.display = 'grid';
  grid.innerHTML = inst.map(i => {
    // Se o banco guarda como array JSON ou string separada por vírgula
    let especialidades = [];
    if (Array.isArray(i.especialidades)) especialidades = i.especialidades;
    else if (typeof i.especialidades === 'string') especialidades = i.especialidades.split(',').map(e => e.trim()).filter(Boolean);

    return `
      <div class="card" style="padding:20px;cursor:pointer;position:relative" data-id="${i.id}">
        <div style="position:absolute;top:10px;right:10px;">
          <button class="btn btn-ghost action-editar" data-id="${i.id}" style="padding:4px 8px;font-size:11px">Editar</button>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--blue),var(--purple));display:grid;place-items:center;font-size:16px;font-weight:600;color:white;flex-shrink:0">${i.nome.charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-weight:600;font-size:14px">${i.nome}</div>
            <div style="font-size:11.5px;color:var(--text-tertiary)">Prof. habilitado</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">
          ${especialidades.map(e => `<span class="badge badge-accent">${e}</span>`).join('')}
          ${especialidades.length === 0 ? `<span style="font-size:11px;color:var(--text-tertiary)">Sem especialidades</span>` : ''}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-secondary)">
          <span>${i.turmas || 0} turma${i.turmas !== 1 ? 's' : ''} ativas</span>
          <span style="color:var(--amber)">★ ${i.avaliacao || '5.0'}</span>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.action-editar').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = _cache.find(x => x.id == btn.dataset.id);
      if (i) modalInstrutor(i);
    });
  });

  document.querySelectorAll('.card[data-id]').forEach(card => {
    card.addEventListener('click', () => {
      const i = _cache.find(x => x.id == card.dataset.id);
      if (i) toast(`Ficha de ${i.nome.split(' ')[0]} (Em breve)`, 'info');
    });
  });
}

function modalInstrutor(inst = null) {
  const isEdit = !!inst;
  
  let espString = '';
  if (inst) {
    if (Array.isArray(inst.especialidades)) espString = inst.especialidades.join(', ');
    else if (typeof inst.especialidades === 'string') espString = inst.especialidades;
  }

  openModal(isEdit ? 'Editar Instrutor' : 'Novo Instrutor', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Nome Completo *</label>
        <input id="f-nome" type="text" value="${inst?.nome || ''}" placeholder="Ex: Carlos Eduardo Lima">
      </div>
      <div class="form-group full">
        <label>Especialidades (separadas por vírgula)</label>
        <input id="f-esp" type="text" value="${espString}" placeholder="Ex: NR-35, NR-33, Primeiros Socorros">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Salvar Alterações' : 'Criar Instrutor'}</button>
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => saveInstrutor(inst?.id));
}

async function saveInstrutor(id) {
  const nome = document.getElementById('f-nome').value.trim();
  const espRaw = document.getElementById('f-esp').value;
  
  if (!nome) {
    toast('O nome é obrigatório.', 'warning');
    return;
  }

  // Usamos JSON array compatility
  const especialidades = espRaw.split(',').map(s => s.trim()).filter(Boolean);

  const payload = {
    tenant_id: getTenantId(),
    nome,
    especialidades // envia como array jsonb ou text[]
  };

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    let error;
    if (id) {
      const res = await supabase.from('instrutores').update(payload).eq('id', id).eq('tenant_id', getTenantId());
      error = res.error;
    } else {
      const res = await supabase.from('instrutores').insert(payload);
      error = res.error;
    }

    if (error) throw error;

    closeModal();
    toast(id ? 'Instrutor atualizado!' : 'Instrutor cadastrado!', 'success');
    await loadData();
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar instrutor', 'error');
    btn.disabled = false;
    btn.textContent = id ? 'Salvar Alterações' : 'Criar Instrutor';
  }
}
