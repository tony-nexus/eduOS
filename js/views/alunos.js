/**
 * /js/views/alunos.js
 * CRUD real via Supabase — sem dados mockados.
 *
 * Operações:
 *  - READ:   loadAlunos() — busca com join em empresas
 *  - CREATE: salvarNovoAluno() — insert + re-fetch
 *  - UPDATE: abrirModalEditar() — update + re-fetch
 *  - DELETE: (via botão "Inativar" no modal de edição)
 *
 * Segurança: tenant_id vem de currentUser (preenchido no login real).
 * As políticas RLS do banco garantem isolamento — o JS só filtra por UX.
 */

import { getClient, getTenantId } from '../core/supabase.js';
import { currentUser } from '../core/auth.js';
import { setContent, openModal, closeModal, toast } from '../ui/components.js';
import { validateForm, fieldOk, clearErrors, isValidCPF, isValidCNPJ, bindBlur } from '../ui/validate.js';

// Cache local — evita re-fetch desnecessário ao filtrar
let _alunosCache = [];
// Cache de empresas para o select do modal
let _empresasCache = [];

// ─── Render principal ─────────────────────────────────────────────────────────
export async function render() {
  // Renderiza o shell da página imediatamente (esqueleto)
  setContent(`
    <div class="page-header">
      <div><h1>Alunos</h1><p>Cadastro e gestão de discentes</p></div>
      <div class="page-header-actions">
        <button class="btn btn-secondary" id="btn-exportar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Exportar
        </button>
        <button class="btn btn-primary" id="btn-novo-aluno">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Novo Aluno
        </button>
      </div>
    </div>

    <!-- KPIs com skeleton enquanto carrega -->
    <div class="stats-row" id="alunos-kpis">
      ${['','','',''].map(() => `<div class="stat-card"><div class="skeleton" style="height:14px;width:80px;margin-bottom:10px"></div><div class="skeleton" style="height:32px;width:60px"></div></div>`).join('')}
    </div>

    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-alunos" placeholder="Nome, CPF ou e-mail...">
        </div>
        <select class="select-input" id="filtro-tipo">
          <option value="">Todos os tipos</option>
          <option value="pessoa_fisica">Pessoa Física</option>
          <option value="empresa">Via Empresa</option>
        </select>
        <select class="select-input" id="filtro-status">
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>
      </div>
      <table>
        <thead><tr>
          <th>Aluno</th><th>CPF</th><th>Contato</th><th>Tipo</th><th>Empresa</th><th>Status</th><th>Ações</th>
        </tr></thead>
        <tbody id="alunos-tbody">
          <tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-tertiary)">
            <div style="display:flex;align-items:center;justify-content:center;gap:10px">
              <div class="skeleton" style="width:16px;height:16px;border-radius:50%"></div>
              Carregando alunos...
            </div>
          </td></tr>
        </tbody>
      </table>
      <div class="table-footer">
        <span class="table-info" id="alunos-count">—</span>
        <div class="pagination" id="alunos-pag"></div>
      </div>
    </div>
  `);

  // Registra listeners que não dependem dos dados
  document.getElementById('btn-novo-aluno')?.addEventListener('click', () => modalNovoAluno());
  document.getElementById('btn-exportar')?.addEventListener('click', () => exportarCSV());

  // Carrega dados do Supabase em paralelo
  await Promise.all([loadAlunos(), loadEmpresas()]);
}

// ─── Fetch de alunos ──────────────────────────────────────────────────────────
async function loadAlunos() {
  try {
    const client = await getClient();
    const { data, error } = await client
      .from('alunos')
      .select('id, nome, cpf, email, telefone, data_nascimento, tipo_pessoa, status, cep, rua, numero, complemento, bairro, cidade, uf, empresa:empresa_id(id, nome)')
      .eq('tenant_id', getTenantId())
      .order('nome')
      .limit(200);

    if (error) throw error;

    _alunosCache = (data ?? []).map(a => ({
      ...a,
      empresa_nome: a.empresa?.nome ?? '—',
      empresa_id:   a.empresa?.id   ?? null,
    }));

  } catch (err) {
    toast(`Erro ao carregar alunos: ${err.message}`, 'error');
    _alunosCache = [];
  }

  renderKPIs(_alunosCache);
  renderTabela(_alunosCache);
  bindFiltros();
}

// ─── Fetch de empresas (para o select do modal) ───────────────────────────────
async function loadEmpresas() {
  try {
    const client = await getClient();
    const { data, error } = await client
      .from('empresas')
      .select('id, nome')
      .eq('tenant_id', getTenantId())
      .eq('status', 'ativo')
      .order('nome');
    if (error) throw error;
    _empresasCache = data ?? [];
  } catch (_) {
    _empresasCache = [];
  }
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function renderKPIs(alunos) {
  const ativos  = alunos.filter(a => a.status === 'ativo').length;
  const pf      = alunos.filter(a => a.tipo_pessoa === 'pessoa_fisica').length;
  const empresa = alunos.filter(a => a.tipo_pessoa === 'empresa').length;

  const kpisEl = document.getElementById('alunos-kpis');
  if (!kpisEl) return;

  kpisEl.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Ativos</div><div class="stat-value" style="color:var(--blue)">${ativos}</div></div>
    <div class="stat-card"><div class="stat-label">Pessoa Física</div><div class="stat-value" style="color:var(--accent)">${pf}</div></div>
    <div class="stat-card"><div class="stat-label">Via Empresa</div><div class="stat-value" style="color:var(--amber)">${empresa}</div></div>
    <div class="stat-card"><div class="stat-label">Total Geral</div><div class="stat-value" style="color:var(--text-primary)">${alunos.length}</div></div>
  `;
}

// ─── Tabela ───────────────────────────────────────────────────────────────────
function renderTabela(alunos) {
  const tbody   = document.getElementById('alunos-tbody');
  const countEl = document.getElementById('alunos-count');
  if (!tbody) return;

  if (!alunos.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:48px;color:var(--text-tertiary)">Nenhum aluno encontrado</td></tr>`;
    if (countEl) countEl.textContent = '0 alunos';
    return;
  }

  tbody.innerHTML = alunos.map(a => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:9px">
          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--purple));display:grid;place-items:center;font-size:11px;font-weight:600;color:white;flex-shrink:0">${a.nome.charAt(0)}</div>
          <div>
            <div style="font-weight:500;font-size:13px">${a.nome}</div>
            <div style="font-size:11px;color:var(--text-tertiary)">${a.email ?? '—'}</div>
          </div>
        </div>
      </td>
      <td style="font-family:var(--font-mono);font-size:12px">${a.cpf ?? '—'}</td>
      <td style="font-size:12.5px">${a.telefone ?? '—'}</td>
      <td><span class="badge ${a.tipo_pessoa === 'pessoa_fisica' ? 'badge-blue' : 'badge-amber'}">${a.tipo_pessoa === 'pessoa_fisica' ? 'PF' : 'Empresa'}</span></td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${a.empresa_nome}</td>
      <td><span class="badge ${a.status === 'ativo' ? 'badge-green' : 'badge-gray'}">${a.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="action-btn" data-action="ver-ficha" data-id="${a.id}">Ver Ficha</button>
          <button class="action-btn" data-action="editar" data-id="${a.id}">Editar</button>
          <button class="action-btn danger" data-action="toggle-status" data-id="${a.id}" data-status="${a.status}">
            ${a.status === 'ativo' ? 'Inativar' : 'Ativar'}
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  if (countEl) countEl.textContent = `${alunos.length} aluno${alunos.length !== 1 ? 's' : ''}`;
  bindRowActions();
}

// ─── Filtros em tempo real (client-side sobre o cache) ─────────────────────────
function bindFiltros() {
  const search   = document.getElementById('search-alunos');
  const filtTipo = document.getElementById('filtro-tipo');
  const filtSt   = document.getElementById('filtro-status');
  if (!search) return;

  function applyFilter() {
    const q  = search.value.toLowerCase().trim();
    const tp = filtTipo.value;
    const st = filtSt.value;
    const filtered = _alunosCache.filter(a =>
      (!q  || a.nome.toLowerCase().includes(q) || (a.cpf ?? '').includes(q) || (a.email ?? '').toLowerCase().includes(q)) &&
      (!tp || a.tipo_pessoa === tp) &&
      (!st || a.status === st)
    );
    renderTabela(filtered);
  }

  search.addEventListener('input', applyFilter);
  filtTipo.addEventListener('change', applyFilter);
  filtSt.addEventListener('change', applyFilter);
}

// ─── Ações das linhas ─────────────────────────────────────────────────────────
function bindRowActions() {
  document.querySelectorAll('.action-btn[data-action="ver-ficha"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const aluno = _alunosCache.find(a => a.id === btn.dataset.id);
      if (aluno) modalVerFicha(aluno);
    });
  });

  document.querySelectorAll('.action-btn[data-action="editar"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const aluno = _alunosCache.find(a => a.id === btn.dataset.id);
      if (aluno) modalEditarAluno(aluno);
    });
  });

  document.querySelectorAll('.action-btn[data-action="toggle-status"]').forEach(btn => {
    btn.addEventListener('click', () => toggleStatus(btn.dataset.id, btn.dataset.status));
  });
}

// ─── Toggle ativo/inativo ─────────────────────────────────────────────────────
async function toggleStatus(id, statusAtual) {
  const novoStatus = statusAtual === 'ativo' ? 'inativo' : 'ativo';
  try {
    const client = await getClient();
    const { error } = await client
      .from('alunos')
      .update({ status: novoStatus })
      .eq('id', id)
      .eq('tenant_id', getTenantId());

    if (error) throw error;
    toast(`Aluno ${novoStatus === 'ativo' ? 'ativado' : 'inativado'} com sucesso`, 'success');
    await loadAlunos(); // re-fetch para atualizar a tabela
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  }
}

// ─── Modal: Ver Ficha ────────────────────────────────────────────────────────
function modalVerFicha(aluno) {
  openModal(`Ficha do Aluno — ${aluno.nome.split(' ')[0]}`, `
    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">Nome:</strong><span>${esc(aluno.nome)}</span></div>
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">CPF:</strong><span>${esc(aluno.cpf || '—')}</span></div>
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">E-mail:</strong><span>${esc(aluno.email || '—')}</span></div>
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">Telefone:</strong><span>${esc(aluno.telefone || '—')}</span></div>
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">Nascimento:</strong><span>${aluno.data_nascimento || '—'}</span></div>
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">Situação:</strong><span><span class="badge ${aluno.status === 'ativo' ? 'badge-green' : 'badge-gray'}">${aluno.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></span></div>
      <hr style="border:0;border-top:1px solid var(--border-color);margin:10px 0"/>
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">CEP:</strong><span>${esc(aluno.cep || '—')}</span></div>
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">Endereço:</strong><span>${aluno.rua ? esc(aluno.rua)+', '+esc(aluno.numero) + (aluno.complemento ? ' - '+esc(aluno.complemento) : '') : '—'}</span></div>
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">Bairro/Cidade:</strong><span>${aluno.bairro ? esc(aluno.bairro)+' - '+esc(aluno.cidade)+'/'+esc(aluno.uf) : '—'}</span></div>
    </div>
    <div class="modal-footer" style="margin-top:24px">
      <button class="btn btn-secondary" id="modal-cancel">Fechar</button>
    </div>
  `);
  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
}

// ─── Utils: Escapar HTML e Auto-CEP ───────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag)
  );
}

// ─── Masks ────────────────────────────────────────────────────────────────────
function maskCPF(v) { return v.replace(/\D/g,'').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2').slice(0,14); }
function maskCNPJ(v) { return v.replace(/\D/g,'').replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\d{4})(\d)/,'$1-$2').slice(0,18); }
function maskTel(v) { 
  let r = v.replace(/\D/g, '');
  if (r.length <= 10) return r.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3').trim();
  return r.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3').trim();
}
function maskCEP(v) { return v.replace(/\D/g,'').replace(/^(\d{5})(\d)/,'$1-$2').slice(0,9); }

function applyMasks(prefix) {
  const cpfEl = document.getElementById(prefix + 'cpf');
  const telEl = document.getElementById(prefix + 'tel');
  const cepEl = document.getElementById(prefix + 'cep');
  const tipoEl = document.getElementById(prefix + 'tipo');

  const updateCpfMask = (el) => {
    if(!el) return;
    const isPessoaFisica = !tipoEl || tipoEl.value === 'pessoa_fisica';
    el.value = isPessoaFisica ? maskCPF(el.value) : maskCNPJ(el.value);
  };

  if (cpfEl) {
    cpfEl.addEventListener('input', (e) => updateCpfMask(e.target));
    if(tipoEl) tipoEl.addEventListener('change', () => { 
      // Update label
      const label = cpfEl.previousElementSibling;
      if (label && label.tagName === 'LABEL') {
        label.textContent = tipoEl.value === 'pessoa_fisica' ? 'CPF *' : 'CNPJ *';
      }
      cpfEl.value = ''; // Limpa ao trocar pra não ter formatação misturada
    });
  }
  if (telEl) telEl.addEventListener('input', (e) => e.target.value = maskTel(e.target.value));
  if (cepEl) cepEl.addEventListener('input', (e) => e.target.value = maskCEP(e.target.value));
}

async function buscarCEP(cep, prefix) {
  const c = cep.replace(/\D/g, '');
  if (c.length !== 8) return;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${c}/json/`);
    const data = await res.json();
    if (data.erro) { toast('CEP não encontrado', 'warning'); return; }
    document.getElementById(prefix + 'rua').value = data.logradouro || '';
    document.getElementById(prefix + 'bairro').value = data.bairro || '';
    document.getElementById(prefix + 'cidade').value = data.localidade || '';
    document.getElementById(prefix + 'uf').value = data.uf || '';
    document.getElementById(prefix + 'numero').focus();
    toast('Endereço preenchido via ViaCEP', 'success');
  } catch (err) {
    toast('Erro ao buscar CEP', 'error');
  }
}

// ─── Modal: Novo Aluno ────────────────────────────────────────────────────────
function modalNovoAluno() {
  const empresaOptions = _empresasCache.map(e =>
    `<option value="${e.id}">${e.nome}</option>`
  ).join('');

  openModal('Novo Aluno', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Nome Completo *</label>
        <input id="f-nome" type="text" placeholder="João da Silva" autocomplete="off">
      </div>
      <div class="form-group">
        <label>CPF *</label>
        <input id="f-cpf" type="text" placeholder="000.000.000-00">
      </div>
      <div class="form-group">
        <label>Data de Nascimento</label>
        <input id="f-nasc" type="date">
      </div>
      <div class="form-group">
        <label>E-mail</label>
        <input id="f-email" type="email" placeholder="joao@email.com">
      </div>
      <div class="form-group">
        <label>Telefone / WhatsApp</label>
        <input id="f-tel" type="text" placeholder="(11) 99999-9999">
      </div>
      <div class="form-group">
        <label>Tipo</label>
        <select id="f-tipo">
          <option value="pessoa_fisica">Pessoa Física</option>
          <option value="empresa">Via Empresa</option>
        </select>
      </div>
      <div class="form-group">
        <label>Empresa (opcional)</label>
        <select id="f-empresa">
          <option value="">— Nenhuma —</option>
          ${empresaOptions}
        </select>
      </div>
      <div class="form-group full" style="grid-column: 1 / -1">
        <hr style="border:0;border-top:1px solid var(--border-color);margin:10px 0"/>
        <label style="color:var(--accent);margin-bottom:8px">Endereço (Auto-CEP)</label>
      </div>
      <div class="form-group">
        <label>CEP</label>
        <input id="f-cep" type="text" placeholder="00000-000">
      </div>
      <div class="form-group full">
        <label>Rua/Logradouro</label>
        <input id="f-rua" type="text">
      </div>
      <div class="form-group">
        <label>Número *</label>
        <input id="f-numero" type="text">
      </div>
      <div class="form-group">
        <label>Complemento</label>
        <input id="f-complemento" type="text">
      </div>
      <div class="form-group">
        <label>Bairro</label>
        <input id="f-bairro" type="text">
      </div>
      <div class="form-group">
        <label>Cidade</label>
        <input id="f-cidade" type="text">
      </div>
      <div class="form-group">
        <label>UF</label>
        <input id="f-uf" type="text" maxlength="2">
      </div>
      <div class="form-group full">
        <hr style="border:0;border-top:1px solid var(--border-color);margin:10px 0"/>
        <label>Observações</label>
        <textarea id="f-obs" placeholder="Informações adicionais..."></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
        Salvar Aluno
      </button>
    </div>
  `);

  applyMasks('f-');
  document.getElementById('f-cep')?.addEventListener('blur', (e) => buscarCEP(e.target.value, 'f-'));
  bindBlur('f-nome',  'Nome',     ['required']);
  bindBlur('f-email', 'E-mail',   ['email']);
  bindBlur('f-tel',   'Telefone', ['phone']);
  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => salvarNovoAluno());
}

// ─── INSERT real ──────────────────────────────────────────────────────────────
async function salvarNovoAluno() {
  const nome       = document.getElementById('f-nome')?.value.trim();
  const cpf        = document.getElementById('f-cpf')?.value.trim();
  const email      = document.getElementById('f-email')?.value.trim();
  const telefone   = document.getElementById('f-tel')?.value.trim();
  const nascimento = document.getElementById('f-nasc')?.value;
  const tipo       = document.getElementById('f-tipo')?.value;
  const empresaId  = document.getElementById('f-empresa')?.value || null;
  const obs        = document.getElementById('f-obs')?.value.trim();

  // Endereço
  const cep         = document.getElementById('f-cep')?.value.trim() || null;
  const rua         = document.getElementById('f-rua')?.value.trim() || null;
  const numero      = document.getElementById('f-numero')?.value.trim() || null;
  const complemento = document.getElementById('f-complemento')?.value.trim() || null;
  const bairro      = document.getElementById('f-bairro')?.value.trim() || null;
  const cidade      = document.getElementById('f-cidade')?.value.trim() || null;
  const uf          = document.getElementById('f-uf')?.value.trim() || null;

  // Validação inline
  const cpfRules = tipo === 'pessoa_fisica'
    ? ['required', 'cpf']
    : ['required', 'cnpj'];

  const ok = validateForm([
    { id: 'f-nome',  value: nome,     rules: ['required'],        label: 'Nome' },
    { id: 'f-cpf',   value: cpf,      rules: cpfRules,            label: tipo === 'pessoa_fisica' ? 'CPF' : 'CNPJ' },
    { id: 'f-email', value: email,    rules: ['email'],           label: 'E-mail' },
    { id: 'f-tel',   value: telefone, rules: ['phone'],           label: 'Telefone' },
  ]);
  if (!ok) return;

  const rawCep = (cep || '').replace(/\D/g, '');
  if (rawCep && rawCep.length !== 8) {
    fieldError('f-cep', 'CEP inválido.'); return;
  }
  fieldOk('f-cep');

  if (nascimento) {
    const age = (new Date() - new Date(nascimento)) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 16) { fieldError('f-nasc', 'Idade mínima: 16 anos.'); return; }
    fieldOk('f-nasc');
  }

  const saveBtn = document.getElementById('modal-save');
  saveBtn.disabled = true;
  saveBtn.innerHTML = 'Salvando...';

  try {
    const client = await getClient();
    const { error } = await client
      .from('alunos')
      .insert({
        tenant_id:       getTenantId(),
        nome,
        cpf,
        email:           email || null,
        telefone:        telefone || null,
        data_nascimento: nascimento || null,
        tipo_pessoa:     tipo,
        empresa_id:      empresaId,
        observacoes:     obs || null,
        status:          'ativo',
        cep, rua, numero, complemento, bairro, cidade, uf
      });

    if (error) {
      // Erro de CPF duplicado (unique constraint)
      if (error.code === '23505') throw new Error('Já existe um aluno cadastrado com este CPF.');
      throw error;
    }

    closeModal();
    toast(`Aluno "${nome.split(' ')[0]}" cadastrado com sucesso!`, 'success');
    await loadAlunos(); // re-fetch para mostrar o novo registro

  } catch (err) {
    toast(`Erro ao salvar: ${err.message}`, 'error');
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg> Salvar Aluno`;
  }
}

// ─── Modal: Editar Aluno ──────────────────────────────────────────────────────
function modalEditarAluno(aluno) {
  const empresaOptions = _empresasCache.map(e =>
    `<option value="${e.id}" ${e.id === aluno.empresa_id ? 'selected' : ''}>${e.nome}</option>`
  ).join('');

  openModal(`Editar — ${aluno.nome.split(' ')[0]}`, `
    <div class="form-grid">
      <div class="form-group full">
        <label>Nome Completo *</label>
        <input id="e-nome" type="text" value="${aluno.nome}">
      </div>
      <div class="form-group">
        <label>CPF</label>
        <input id="e-cpf" type="text" value="${aluno.cpf ?? ''}" disabled style="opacity:0.6">
      </div>
      <div class="form-group">
        <label>E-mail</label>
        <input id="e-email" type="email" value="${aluno.email ?? ''}">
      </div>
      <div class="form-group">
        <label>Telefone / WhatsApp</label>
        <input id="e-tel" type="text" value="${aluno.telefone ?? ''}">
      </div>
      <div class="form-group">
        <label>Tipo</label>
        <select id="e-tipo">
          <option value="pessoa_fisica" ${aluno.tipo_pessoa === 'pessoa_fisica' ? 'selected' : ''}>Pessoa Física</option>
          <option value="empresa"       ${aluno.tipo_pessoa === 'empresa'       ? 'selected' : ''}>Via Empresa</option>
        </select>
      </div>
      <div class="form-group">
        <label>Empresa</label>
        <select id="e-empresa">
          <option value="">— Nenhuma —</option>
          ${empresaOptions}
        </select>
      </div>
      <div class="form-group full" style="grid-column: 1 / -1">
        <hr style="border:0;border-top:1px solid var(--border-color);margin:10px 0"/>
        <label style="color:var(--accent);margin-bottom:8px">Endereço (Auto-CEP)</label>
      </div>
      <div class="form-group">
        <label>CEP</label>
        <input id="e-cep" type="text" placeholder="00000-000" value="${aluno.cep || ''}">
      </div>
      <div class="form-group full">
        <label>Rua/Logradouro</label>
        <input id="e-rua" type="text" value="${esc(aluno.rua || '')}">
      </div>
      <div class="form-group">
        <label>Número *</label>
        <input id="e-numero" type="text" value="${esc(aluno.numero || '')}">
      </div>
      <div class="form-group">
        <label>Complemento</label>
        <input id="e-complemento" type="text" value="${esc(aluno.complemento || '')}">
      </div>
      <div class="form-group">
        <label>Bairro</label>
        <input id="e-bairro" type="text" value="${esc(aluno.bairro || '')}">
      </div>
      <div class="form-group">
        <label>Cidade</label>
        <input id="e-cidade" type="text" value="${esc(aluno.cidade || '')}">
      </div>
      <div class="form-group">
        <label>UF</label>
        <input id="e-uf" type="text" maxlength="2" value="${esc(aluno.uf || '')}">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-update" data-id="${aluno.id}">Salvar Alterações</button>
    </div>
  `);

  applyMasks('e-');
  // Ajusta a label inicial do CPF/CNPJ
  const tipoEl = document.getElementById('e-tipo');
  const cpfLabel = document.getElementById('e-cpf')?.previousElementSibling;
  if(tipoEl && cpfLabel && cpfLabel.tagName === 'LABEL') {
    cpfLabel.textContent = tipoEl.value === 'pessoa_fisica' ? 'CPF' : 'CNPJ';
  }

  document.getElementById('e-cep')?.addEventListener('blur', (e) => buscarCEP(e.target.value, 'e-'));
  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-update')?.addEventListener('click', () => atualizarAluno(aluno.id));
}

// ─── UPDATE real ──────────────────────────────────────────────────────────────
async function atualizarAluno(id) {
  const nome      = document.getElementById('e-nome')?.value.trim();
  const email     = document.getElementById('e-email')?.value.trim();
  const telefone  = document.getElementById('e-tel')?.value.trim();
  const tipo      = document.getElementById('e-tipo')?.value;
  const empresaId = document.getElementById('e-empresa')?.value || null;
  const cep         = document.getElementById('e-cep')?.value.trim() || null;
  const rua         = document.getElementById('e-rua')?.value.trim() || null;
  const numero      = document.getElementById('e-numero')?.value.trim() || null;
  const complemento = document.getElementById('e-complemento')?.value.trim() || null;
  const bairro      = document.getElementById('e-bairro')?.value.trim() || null;
  const cidade      = document.getElementById('e-cidade')?.value.trim() || null;
  const uf          = document.getElementById('e-uf')?.value.trim() || null;

  if (!nome) { toast('O campo Nome é obrigatório.', 'warning'); return; }
  
  const rawTel = (telefone || '').replace(/\D/g, '');
  if (rawTel && rawTel.length < 10) { toast('Telefone inválido. Deve ter pelo menos 10 dígitos com DDD.', 'warning'); return; }

  const rawCep = (cep || '').replace(/\D/g, '');
  if (rawCep && rawCep.length !== 8) { toast('CEP inválido.', 'warning'); return; }

  const updateBtn = document.getElementById('modal-update');
  updateBtn.disabled = true;
  updateBtn.textContent = 'Salvando...';

  try {
    const client = await getClient();
    const { error } = await client
      .from('alunos')
      .update({
        nome,
        email:      email     || null,
        telefone:   telefone  || null,
        tipo_pessoa: tipo,
        empresa_id: empresaId,
        cep, rua, numero, complemento, bairro, cidade, uf
      })
      .eq('id', id)
      .eq('tenant_id', getTenantId());

    if (error) throw error;

    closeModal();
    toast('Dados atualizados com sucesso!', 'success');
    await loadAlunos();

  } catch (err) {
    toast(`Erro ao atualizar: ${err.message}`, 'error');
    updateBtn.disabled = false;
    updateBtn.textContent = 'Salvar Alterações';
  }
}

// ─── Exportar CSV ────────────────────────────────────────────────────────────
function exportarCSV() {
  if (!_alunosCache.length) {
    toast('Nenhum dado para exportar.', 'warning');
    return;
  }
  const headers = ['Nome','CPF','Email','Telefone','Tipo','Empresa','Status'];
  const rows = _alunosCache.map(a => [
    a.nome, a.cpf, a.email ?? '', a.telefone ?? '',
    a.tipo_pessoa, a.empresa_nome, a.status,
  ].map(v => `"${v}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'alunos.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('Exportação concluída!', 'success');
}
