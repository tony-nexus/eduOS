/**
 * /js/views/empresas.js
 * CRUD real para Empresas B2B.
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast, esc } from '../ui/components.js';
import { validateForm, bindBlur } from '../ui/validate.js';

let _empresas = [];

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Empresas B2B</h1><p>Clientes corporativos e contratos</p></div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-nova-emp">Nova Empresa</button>
      </div>
    </div>
    <div class="stats-row" id="emps-kpis">
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
    </div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-emps" placeholder="Nome ou CNPJ...">
        </div>
        <select class="select-input" id="filtro-status-emp">
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>
      </div>
      <table>
        <thead><tr><th>Empresa</th><th>CNPJ</th><th>Responsável</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody id="emps-tbody">
          <tr><td colspan="5" style="text-align:center;padding:40px"><div class="skeleton" style="width:16px;height:16px;border-radius:50%;display:inline-block"></div> Carregando...</td></tr>
        </tbody>
      </table>
    </div>
  `);

  document.getElementById('btn-nova-emp')?.addEventListener('click', () => modalEmpresa());
  document.getElementById('search-emps')?.addEventListener('input', applyFilter);
  document.getElementById('filtro-status-emp')?.addEventListener('change', applyFilter);

  await loadData();
}

async function loadData() {
  try {
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .eq('tenant_id', getTenantId())
      .order('nome');

    if (error) throw error;
    _empresas = data || [];
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar empresas', 'error');
    _empresas = [];
  }
  
  renderKPIs(_empresas);
  applyFilter();
}

function renderKPIs(emps) {
  const ativas = emps.filter(e => e.status === 'ativo').length;
  
  const el = document.getElementById('emps-kpis');
  if(!el) return;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Cadastradas</div><div class="stat-value" style="color:var(--text-primary)">${emps.length}</div></div>
    <div class="stat-card"><div class="stat-label">Empresas Ativas</div><div class="stat-value" style="color:var(--blue)">${ativas}</div></div>
    <div class="stat-card"><div class="stat-label">Alunos Vinculados</div><div class="stat-value" style="color:var(--accent);font-size:18px">- (Ver Alunos)</div></div>
  `;
}

function applyFilter() {
  const q  = document.getElementById('search-emps')?.value.toLowerCase() || '';
  const st = document.getElementById('filtro-status-emp')?.value || '';
  const f  = _empresas.filter(e =>
    (!q  || e.nome.toLowerCase().includes(q) || (e.cnpj||'').toLowerCase().includes(q)) &&
    (!st || e.status === st)
  );
  
  const tbody = document.getElementById('emps-tbody');
  if(!tbody) return;

  if(!f.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-tertiary)">Nenhuma empresa encontrada</td></tr>`;
    return;
  }

  tbody.innerHTML = f.map(e => `
    <tr>
      <td style="font-weight:500">${esc(e.nome)}</td>
      <td style="font-family:var(--font-mono);font-size:12px">${esc(e.cnpj || '—')}</td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${esc(e.responsavel || '—')}</td>
      <td><span class="badge ${e.status==='ativo'?'badge-green':'badge-gray'}">${e.status==='ativo'?'Ativo':'Inativo'}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="action-btn action-editar" data-id="${e.id}">Editar</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.action-editar').forEach(btn => {
    btn.addEventListener('click', () => {
      const e = _empresas.find(x => x.id == btn.dataset.id);
      if(e) modalEmpresa(e);
    });
  });
}

function modalEmpresa(emp = null) {
  const isEdit = !!emp;
  openModal(isEdit ? 'Editar Empresa' : 'Nova Empresa', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Razão Social / Nome Fantasia *</label>
        <input id="f-nome" type="text" value="${emp?.nome || ''}" placeholder="Ex: TechCorp Soluções Ltda">
      </div>
      <div class="form-group">
        <label>CNPJ</label>
        <input id="f-cnpj" type="text" value="${emp?.cnpj || ''}" placeholder="00.000.000/0001-00">
      </div>
      <div class="form-group">
        <label>Responsável de RH/SST</label>
        <input id="f-resp" type="text" value="${emp?.responsavel || ''}" placeholder="Nome do contato principal">
      </div>
      <div class="form-group">
        <label>Telefone Contato</label>
        <input id="f-tel" type="text" value="${emp?.telefone || ''}" placeholder="(11) 99999-9999">
      </div>
      <div class="form-group">
        <label>E-mail Comercial</label>
        <input id="f-email" type="email" value="${emp?.email || ''}" placeholder="contato@empresa.com">
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="f-status">
          <option value="ativo" ${emp?.status==='ativo'?'selected':''}>Ativo</option>
          <option value="inativo" ${emp?.status==='inativo'?'selected':''}>Inativo</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Salvar Alterações' : 'Criar Empresa'}</button>
    </div>
  `);

  // Máscara CNPJ
  document.getElementById('f-cnpj')?.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g,'');
    v = v.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3')
         .replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2').slice(0,18);
    e.target.value = v;
  });
  // Máscara telefone
  document.getElementById('f-tel')?.addEventListener('input', e => {
    let r = e.target.value.replace(/\D/g,'');
    e.target.value = r.length <= 10
      ? r.replace(/^(\d{2})(\d{4})(\d{0,4}).*/,'($1) $2-$3').trim()
      : r.replace(/^(\d{2})(\d{5})(\d{0,4}).*/,'($1) $2-$3').trim();
  });
  bindBlur('f-nome',  'Nome',     ['required']);
  bindBlur('f-cnpj',  'CNPJ',    ['cnpj']);
  bindBlur('f-email', 'E-mail',  ['email']);
  bindBlur('f-tel',   'Telefone',['phone']);
  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => saveEmpresa(emp?.id));
}

async function saveEmpresa(id) {
  const nome = document.getElementById('f-nome').value.trim();
  const cnpj = document.getElementById('f-cnpj').value.trim() || null;
  const responsavel = document.getElementById('f-resp').value.trim() || null;
  const telefone = document.getElementById('f-tel').value.trim() || null;
  const email = document.getElementById('f-email').value.trim() || null;
  const status = document.getElementById('f-status').value;

  const ok = validateForm([
    { id: 'f-nome',  value: nome,     rules: ['required'], label: 'Nome' },
    { id: 'f-cnpj',  value: cnpj||'', rules: ['cnpj'],     label: 'CNPJ' },
    { id: 'f-email', value: email||'',rules: ['email'],    label: 'E-mail' },
    { id: 'f-tel',   value: telefone||'', rules: ['phone'],label: 'Telefone' },
  ]);
  if (!ok) return;

  const payload = {
    tenant_id: getTenantId(),
    nome,
    cnpj:        cnpj        || null,
    responsavel: responsavel || null,
    telefone:    telefone    || null,
    email:       email       || null,
    status
  };

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    let error;
    if (id) {
      const res = await supabase.from('empresas').update(payload).eq('id', id).eq('tenant_id', getTenantId());
      error = res.error;
    } else {
      const res = await supabase.from('empresas').insert(payload);
      error = res.error;
    }

    if (error) throw error;

    closeModal();
    toast(id ? 'Empresa atualizada!' : 'Empresa cadastrada!', 'success');
    await loadData();
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar empresa.', 'error');
    btn.disabled = false;
    btn.textContent = id ? 'Salvar Alterações' : 'Criar Empresa';
  }
}
