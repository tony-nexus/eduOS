/**
 * /js/views/instrutores.js
 * CRUD real para Instrutores via Supabase.
 * Melhorias:
 *  - Todos os campos obrigatórios (nome, email, telefone, especialidades)
 *  - Removida pontuação ★ 5.0 dos cards
 *  - Botão Excluir com modal de confirmação
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast } from '../ui/components.js';
import { validateForm, bindBlur } from '../ui/validate.js';

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
    let especialidades = [];
    if (Array.isArray(i.especialidades)) especialidades = i.especialidades;
    else if (typeof i.especialidades === 'string')
      especialidades = i.especialidades.split(',').map(e => e.trim()).filter(Boolean);

    return `
      <div class="card" style="padding:20px;position:relative" data-id="${i.id}">
        <div style="position:absolute;top:10px;right:10px;display:flex;gap:4px">
          <button class="action-btn action-editar" data-id="${i.id}" style="font-size:11px;padding:4px 8px">Editar</button>
          <button class="action-btn danger action-excluir" data-id="${i.id}" style="font-size:11px;padding:4px 8px">Excluir</button>
        </div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
          <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--blue),var(--purple));display:grid;place-items:center;font-size:16px;font-weight:600;color:white;flex-shrink:0">${i.nome.charAt(0).toUpperCase()}</div>
          <div>
            <div style="font-weight:600;font-size:14px">${i.nome}</div>
            <div style="font-size:11.5px;color:var(--text-tertiary)">${i.email || 'Sem e-mail'}</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">
          ${especialidades.map(e => `<span class="badge badge-accent">${e}</span>`).join('')}
          ${especialidades.length === 0 ? `<span style="font-size:11px;color:var(--text-tertiary)">Sem especialidades</span>` : ''}
        </div>
        <div style="font-size:12px;color:var(--text-secondary)">
          <span>${i.turmas || 0} turma${i.turmas !== 1 ? 's' : ''} ativas</span>
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

  document.querySelectorAll('.action-excluir').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = _cache.find(x => x.id == btn.dataset.id);
      if (i) confirmarExclusaoInstrutor(i);
    });
  });
}

// ─── Modal Instrutor ──────────────────────────────────────────────────────────
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
      <div class="form-group">
        <label>E-mail *</label>
        <input id="f-email" type="email" value="${inst?.email || ''}" placeholder="instrutor@email.com">
      </div>
      <div class="form-group">
        <label>Telefone *</label>
        <input id="f-tel" type="text" value="${inst?.telefone || ''}" placeholder="(11) 99999-9999">
      </div>
      <div class="form-group full">
        <label>Especialidades * (separadas por vírgula)</label>
        <input id="f-esp" type="text" value="${espString}" placeholder="Ex: NR-35, NR-33, Primeiros Socorros">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Salvar Alterações' : 'Criar Instrutor'}</button>
    </div>
  `);

  bindBlur('f-nome',  'Nome',           ['required']);
  bindBlur('f-email', 'E-mail',         ['required', 'email']);
  bindBlur('f-tel',   'Telefone',       ['required', 'phone']);
  bindBlur('f-esp',   'Especialidades', ['required']);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => saveInstrutor(inst?.id));
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
    nome,
    email,
    telefone: tel,
    especialidades,
  };

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    let error;
    if (id) {
      ({ error } = await supabase.from('instrutores').update(payload).eq('id', id).eq('tenant_id', getTenantId()));
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
    btn.disabled = false;
    btn.textContent = id ? 'Salvar Alterações' : 'Criar Instrutor';
  }
}

// ─── Excluir Instrutor ────────────────────────────────────────────────────────
function confirmarExclusaoInstrutor(inst) {
  openModal('Excluir Instrutor', `
    <div class="danger-banner">
      <div class="danger-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </div>
      <div class="danger-banner-info">
        <div class="danger-banner-title">Excluir instrutor permanentemente</div>
        <div class="danger-banner-sub">${inst.nome}</div>
      </div>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.6">
      Esta ação é irreversível. Turmas vinculadas a este instrutor <strong style="color:var(--red)">perderão o vínculo</strong>.
    </p>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-danger" id="btn-confirmar-exclusao">Excluir Instrutor</button>
    </div>
  `);
  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('btn-confirmar-exclusao')?.addEventListener('click', () => excluirInstrutor(inst.id));
}

async function excluirInstrutor(id) {
  const btn = document.getElementById('btn-confirmar-exclusao');
  btn.disabled = true;
  btn.textContent = 'Excluindo...';
  try {
    const { error } = await supabase.from('instrutores').delete().eq('id', id).eq('tenant_id', getTenantId());
    if (error) throw error;
    closeModal();
    toast('Instrutor excluído com sucesso.', 'success');
    await loadData();
  } catch (err) {
    toast(`Erro ao excluir: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Excluir Instrutor';
  }
}
