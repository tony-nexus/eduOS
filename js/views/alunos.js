/**
 * /js/views/alunos.js
 * CRUD real via Supabase — sem dados mockados.
 * v3 — Múltiplos documentos (CPF + RNM + CNH simultâneos)
 *
 * Operações:
 *  - READ:   loadAlunos() — busca com join em empresas
 *  - CREATE: salvarNovoAluno() — insert + re-fetch
 *  - UPDATE: modalEditarAluno() — update + re-fetch
 *  - DELETE: excluirAluno() / excluirSelecionados()
 *
 * Segurança: tenant_id vem de currentUser (preenchido no login real).
 * As políticas RLS do banco garantem isolamento — o JS só filtra por UX.
 */

import { getClient, getTenantId } from '../core/supabase.js';
import { currentUser } from '../core/auth.js';
import { setContent, openModal, closeModal, toast } from '../ui/components.js';
import { validateForm, fieldError, fieldOk, bindBlur } from '../ui/validate.js';
import { criarMatriculaAutomatica } from '../core/automations.js';

// Cache local — evita re-fetch desnecessário ao filtrar
let _alunosCache  = [];
// Cache de empresas para o select do modal
let _empresasCache = [];
// Cache de cursos para matrícula automática
let _cursosCache  = [];
// IDs selecionados para delete em massa
let _selectedIds  = new Set();

// ─── Render principal ─────────────────────────────────────────────────────────
export async function render() {
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

    <div class="stats-row" id="alunos-kpis">
      ${['','','',''].map(() => `<div class="stat-card"><div class="skeleton" style="height:14px;width:80px;margin-bottom:10px"></div><div class="skeleton" style="height:32px;width:60px"></div></div>`).join('')}
    </div>

    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-alunos" placeholder="Nome, CPF, RNM, CNH, telefone ou e-mail...">
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
        <button class="btn" id="btn-excluir-selecionados" hidden
          style="background:var(--red);color:#fff;opacity:0.9;display:none" aria-live="polite">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          <span id="btn-excluir-label">Excluir selecionados</span>
        </button>
      </div>
      <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th style="width:36px;padding:10px 8px">
            <input type="checkbox" id="check-all" aria-label="Selecionar todos"
              style="width:15px;height:15px;cursor:pointer;accent-color:var(--red)">
          </th>
          <th>Aluno</th><th>Documentos</th><th>Contato</th><th>Tipo</th><th>Empresa</th><th>Status</th><th>Ações</th>
        </tr></thead>
        <tbody id="alunos-tbody">
          <tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-tertiary)">
            <div style="display:flex;align-items:center;justify-content:center;gap:10px">
              <div class="skeleton" style="width:16px;height:16px;border-radius:50%"></div>
              Carregando alunos...
            </div>
          </td></tr>
        </tbody>
      </table>
      </div>
      <div class="table-footer">
        <span class="table-info" id="alunos-count">—</span>
        <div class="pagination" id="alunos-pag"></div>
      </div>
    </div>
  `);

  document.getElementById('btn-novo-aluno')?.addEventListener('click', () => modalNovoAluno());
  document.getElementById('btn-exportar')?.addEventListener('click', () => exportarCSV());
  document.getElementById('btn-excluir-selecionados')?.addEventListener('click', () => excluirSelecionados());

  await Promise.all([loadAlunos(), loadEmpresas(), loadCursos()]);
}

// ─── Fetch de alunos ──────────────────────────────────────────────────────────
async function loadAlunos() {
  try {
    const client = await getClient();
    const { data, error } = await client
      .from('alunos')
      .select('id, nome, cpf, rnm, cnh_num, email, telefone, data_nascimento, tipo_pessoa, status, cep, rua, numero, complemento, bairro, cidade, uf, empresa:empresa_id(id, nome)')
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

// ─── Fetch de cursos (para matrícula automática) ──────────────────────────────
async function loadCursos() {
  try {
    const client = await getClient();
    const { data } = await client
      .from('cursos')
      .select('id, nome, codigo')
      .eq('tenant_id', getTenantId())
      .eq('ativo', true)
      .order('nome');
    _cursosCache = data ?? [];
  } catch (_) {
    _cursosCache = [];
  }
}

// ─── Fetch de empresas ────────────────────────────────────────────────────────
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
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:48px;color:var(--text-tertiary)">Nenhum aluno encontrado</td></tr>`;
    if (countEl) countEl.textContent = '0 alunos';
    updateSelecaoUI();
    return;
  }

  tbody.innerHTML = alunos.map(a => {
    // Monta coluna de documentos
    const docs = [];
    if (a.cpf)     docs.push(`<div><span class="badge badge-blue" style="font-size:9px;margin-right:4px">CPF</span><span style="font-family:var(--font-mono);font-size:12px">${esc(a.cpf)}</span></div>`);
    if (a.rnm)     docs.push(`<div><span class="badge badge-purple" style="font-size:9px;margin-right:4px">RNM</span><span style="font-family:var(--font-mono);font-size:12px">${esc(a.rnm)}</span></div>`);
    if (a.cnh_num) docs.push(`<div><span class="badge badge-amber" style="font-size:9px;margin-right:4px">CNH</span><span style="font-family:var(--font-mono);font-size:12px">${esc(a.cnh_num)}</span></div>`);
    const docsHtml = docs.length ? docs.join('') : '<span style="color:var(--text-tertiary)">—</span>';

    return `
    <tr data-id="${a.id}">
      <td style="padding:10px 8px">
        <input type="checkbox" class="row-check" data-id="${a.id}"
          aria-label="Selecionar ${esc(a.nome)}"
          style="width:15px;height:15px;cursor:pointer;accent-color:var(--red)"
          ${_selectedIds.has(a.id) ? 'checked' : ''}>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:9px">
          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--purple));display:grid;place-items:center;font-size:11px;font-weight:600;color:white;flex-shrink:0" aria-hidden="true">${a.nome.charAt(0)}</div>
          <div>
            <div style="font-weight:500;font-size:13px">${esc(a.nome)}</div>
            <div style="font-size:11px;color:var(--text-tertiary)">${esc(a.email ?? '—')}</div>
          </div>
        </div>
      </td>
      <td style="line-height:1.8">${docsHtml}</td>
      <td style="font-size:12.5px">${esc(a.telefone ?? '—')}</td>
      <td><span class="badge ${a.tipo_pessoa === 'pessoa_fisica' ? 'badge-blue' : 'badge-amber'}">${a.tipo_pessoa === 'pessoa_fisica' ? 'PF' : 'Empresa'}</span></td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${esc(a.empresa_nome)}</td>
      <td><span class="badge ${a.status === 'ativo' ? 'badge-green' : 'badge-gray'}">${a.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="action-btn" data-action="ver-ficha" data-id="${a.id}">Ver Ficha</button>
          <button class="action-btn" data-action="editar" data-id="${a.id}">Editar</button>
          <button class="action-btn danger" data-action="toggle-status" data-id="${a.id}" data-status="${a.status}">
            ${a.status === 'ativo' ? 'Inativar' : 'Ativar'}
          </button>
          <button class="action-btn danger" data-action="excluir" data-id="${a.id}" data-nome="${esc(a.nome)}"
            title="Excluir permanentemente" aria-label="Excluir ${esc(a.nome)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
          </button>
        </div>
      </td>
    </tr>
  `}).join('');

  if (countEl) countEl.textContent = `${alunos.length} aluno${alunos.length !== 1 ? 's' : ''}`;
  bindRowActions();
  bindCheckboxes();
}

// ─── Filtros em tempo real ────────────────────────────────────────────────────
function bindFiltros() {
  const search   = document.getElementById('search-alunos');
  const filtTipo = document.getElementById('filtro-tipo');
  const filtSt   = document.getElementById('filtro-status');
  if (!search) return;

  function applyFilter() {
    const raw = search.value.trim();
    const q   = raw.toLowerCase();
    const qDigits = raw.replace(/\D/g, '');
    const tp  = filtTipo.value;
    const st  = filtSt.value;

    const filtered = _alunosCache.filter(a => {
      if (q) {
        const nomeMatch  = a.nome.toLowerCase().includes(q);
        const emailMatch = (a.email ?? '').toLowerCase().includes(q);
        const cpfDigits  = (a.cpf  ?? '').replace(/\D/g, '');
        const rnmMatch   = (a.rnm  ?? '').toLowerCase().includes(q);
        const cnhMatch   = (a.cnh_num ?? '').includes(q);
        const telDigits  = (a.telefone ?? '').replace(/\D/g, '');
        const cpfMatch   = qDigits ? cpfDigits.includes(qDigits) : (a.cpf ?? '').includes(q);
        const telMatch   = qDigits ? telDigits.includes(qDigits) : (a.telefone ?? '').includes(q);
        if (!nomeMatch && !emailMatch && !cpfMatch && !rnmMatch && !cnhMatch && !telMatch) return false;
      }
      if (tp && a.tipo_pessoa !== tp) return false;
      if (st && a.status !== st) return false;
      return true;
    });
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
  document.querySelectorAll('.action-btn[data-action="excluir"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const aluno = _alunosCache.find(a => a.id === btn.dataset.id);
      if (aluno) abrirModalExclusao(aluno);
    });
  });
}

// ─── Checkboxes de seleção ────────────────────────────────────────────────────
function bindCheckboxes() {
  document.querySelectorAll('.row-check').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) _selectedIds.add(cb.dataset.id);
      else _selectedIds.delete(cb.dataset.id);
      updateSelecaoUI();
    });
  });

  const checkAll = document.getElementById('check-all');
  if (checkAll) {
    const visibleIds = [...document.querySelectorAll('.row-check')].map(c => c.dataset.id);
    checkAll.checked = visibleIds.length > 0 && visibleIds.every(id => _selectedIds.has(id));
    checkAll.indeterminate = !checkAll.checked && visibleIds.some(id => _selectedIds.has(id));

    checkAll.addEventListener('change', () => {
      document.querySelectorAll('.row-check').forEach(cb => {
        cb.checked = checkAll.checked;
        if (checkAll.checked) _selectedIds.add(cb.dataset.id);
        else _selectedIds.delete(cb.dataset.id);
      });
      updateSelecaoUI();
    });
  }
}

function updateSelecaoUI() {
  const btn   = document.getElementById('btn-excluir-selecionados');
  const label = document.getElementById('btn-excluir-label');
  if (!btn) return;
  const n = _selectedIds.size;
  if (n > 0) {
    btn.hidden = false;
    btn.style.display = '';
    if (label) label.textContent = `Excluir ${n} selecionado${n !== 1 ? 's' : ''}`;
  } else {
    btn.hidden = true;
    btn.style.display = 'none';
  }
  const checkAll = document.getElementById('check-all');
  if (checkAll) {
    const allCbs = [...document.querySelectorAll('.row-check')];
    checkAll.checked = allCbs.length > 0 && allCbs.every(c => _selectedIds.has(c.dataset.id));
    checkAll.indeterminate = !checkAll.checked && allCbs.some(c => _selectedIds.has(c.dataset.id));
  }
}

// ─── Retorna o documento identificador principal do aluno ────────────────────
function getDocIdentifier(aluno) {
  if (aluno.cpf)     return { label: 'CPF',  value: aluno.cpf };
  if (aluno.rnm)     return { label: 'RNM',  value: aluno.rnm };
  if (aluno.cnh_num) return { label: 'CNH',  value: aluno.cnh_num };
  return null;
}

// ─── Modal de exclusão individual (estilo GitHub / Supabase) ──────────────────
async function abrirModalExclusao(aluno) {
  const client = await getClient();
  const tid    = getTenantId();

  // Consulta impacto em paralelo
  const [rCerts, rMats, rPags] = await Promise.all([
    client.from('certificados').select('*', { count: 'exact', head: true }).eq('aluno_id', aluno.id).eq('tenant_id', tid),
    client.from('matriculas')  .select('*', { count: 'exact', head: true }).eq('aluno_id', aluno.id).eq('tenant_id', tid),
    client.from('pagamentos')  .select('*', { count: 'exact', head: true }).eq('aluno_id', aluno.id).eq('tenant_id', tid),
  ]);

  const nCerts = rCerts.count ?? 0;
  const nMats  = rMats.count  ?? 0;
  const nPags  = rPags.count  ?? 0;
  const temVinculo = nCerts > 0 || nMats > 0 || nPags > 0;

  const doc = getDocIdentifier(aluno);
  const primeiroNome = aluno.nome.split(' ')[0];

  // Bloco de impacto — só renderiza se houver vínculos
  const impactoHTML = temVinculo ? `
    <div class="danger-impact-box">
      <p>⚠ Esta exclusão irá remover permanentemente todos os registros vinculados:</p>
      ${nMats  > 0 ? `<div class="danger-impact-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        Matrículas <span class="danger-impact-count">${nMats}</span>
      </div>` : ''}
      ${nCerts > 0 ? `<div class="danger-impact-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>
        Certificados <span class="danger-impact-count">${nCerts}</span>
      </div>` : ''}
      ${nPags  > 0 ? `<div class="danger-impact-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
        Pagamentos <span class="danger-impact-count">${nPags}</span>
      </div>` : ''}
    </div>` : `
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;font-family:var(--font-mono)">
      Nenhum registro vinculado encontrado. A exclusão remove apenas o cadastro do aluno.
    </p>`;

  // Bloco de confirmação pelo nome do aluno
  const confirmHTML = `
    <div class="danger-confirm-wrap">
      <label>Para confirmar, digite o <strong>nome</strong> do aluno abaixo:</label>
      <code class="danger-confirm-code">${esc(aluno.nome)}</code>
      <input
        id="danger-confirm-input"
        class="danger-confirm-input"
        type="text"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        placeholder="Digite o nome para confirmar...">
    </div>`;

  const expectedValue = aluno.nome;

  openModal('Excluir aluno permanentemente', `
    <div class="danger-banner">
      <div class="danger-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
      </div>
      <div class="danger-banner-info">
        <div class="danger-banner-title">${esc(aluno.nome)}</div>
        <div class="danger-banner-sub">${doc ? `${doc.label}: ${esc(doc.value)}` : 'Sem documento cadastrado'}</div>
      </div>
    </div>

    ${impactoHTML}
    ${confirmHTML}

    <div class="modal-footer">
      <button class="btn btn-secondary" id="danger-cancel-btn">Cancelar</button>
      <button class="btn btn-danger" id="danger-confirm-btn" disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
        </svg>
        Excluir permanentemente
      </button>
    </div>
  `);

  // Listeners pós-render
  document.getElementById('danger-cancel-btn')?.addEventListener('click', () => closeModal());

  const input  = document.getElementById('danger-confirm-input');
  const btnDel = document.getElementById('danger-confirm-btn');

  input?.addEventListener('input', () => {
    const match = input.value.trim() === expectedValue.trim();
    input.classList.toggle('valid', match);
    btnDel.disabled = !match;
  });

  btnDel?.addEventListener('click', async () => {
    btnDel.disabled = true;
    btnDel.innerHTML = '<span style="font-family:var(--font-mono);font-size:12px">Excluindo...</span>';
    try {
      await executarExclusaoCascade(aluno.id);
      closeModal();
      _selectedIds.delete(aluno.id);
      toast(`${primeiroNome} excluído permanentemente.`, 'success');
      await loadAlunos();
    } catch (err) {
      toast(`Erro ao excluir: ${err.message}`, 'error');
      btnDel.disabled = false;
      btnDel.innerHTML = 'Excluir permanentemente';
    }
  });
}

// ─── Exclusão cascade (ordem correta de FKs) ─────────────────────────────────
async function executarExclusaoCascade(id) {
  const client = await getClient();
  const tid    = getTenantId();

  // 1. Certificados (FK RESTRICT em alunos → precisa ir antes)
  const { error: e1 } = await client.from('certificados').delete().eq('aluno_id', id).eq('tenant_id', tid);
  if (e1) throw e1;

  // 2. Pagamentos (FK CASCADE de matriculas, mas explicito para garantir)
  const { error: e2 } = await client.from('pagamentos').delete().eq('aluno_id', id).eq('tenant_id', tid);
  if (e2) throw e2;

  // 3. Matrículas (FK RESTRICT em alunos)
  const { error: e3 } = await client.from('matriculas').delete().eq('aluno_id', id).eq('tenant_id', tid);
  if (e3) throw e3;

  // 4. Aluno
  const { error: e4 } = await client.from('alunos').delete().eq('id', id).eq('tenant_id', tid);
  if (e4) throw e4;
}

// ─── Modal de exclusão em massa ───────────────────────────────────────────────
async function excluirSelecionados() {
  const ids = [..._selectedIds];
  if (!ids.length) return;

  const n = ids.length;

  openModal('Excluir alunos selecionados', `
    <div class="danger-banner">
      <div class="danger-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="22" height="22">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </div>
      <div class="danger-banner-info">
        <div class="danger-banner-title">${n} aluno${n !== 1 ? 's' : ''} selecionado${n !== 1 ? 's' : ''}</div>
        <div class="danger-banner-sub">Todos os registros vinculados serão removidos</div>
      </div>
    </div>

    <div class="danger-impact-box" style="margin-bottom:20px">
      <p>⚠ Para cada aluno selecionado, serão excluídos permanentemente:</p>
      <div class="danger-impact-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M9 11l3 3L22 4"/></svg>
        Matrículas, certificados e pagamentos vinculados
      </div>
      <div class="danger-impact-row" style="color:var(--red);font-size:12px;font-family:var(--font-mono)">
        Esta ação não pode ser desfeita.
      </div>
    </div>

    <div class="danger-confirm-wrap">
      <label>Para confirmar, digite <strong>${n}</strong> no campo abaixo:</label>
      <code class="danger-confirm-code">${n}</code>
      <input id="danger-mass-input" class="danger-confirm-input" type="text"
        inputmode="numeric" autocomplete="off" placeholder="Digite o número de alunos...">
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" id="danger-mass-cancel">Cancelar</button>
      <button class="btn btn-danger" id="danger-mass-confirm" disabled>
        Excluir ${n} aluno${n !== 1 ? 's' : ''} permanentemente
      </button>
    </div>
  `);

  document.getElementById('danger-mass-cancel')?.addEventListener('click', () => closeModal());

  const input  = document.getElementById('danger-mass-input');
  const btnDel = document.getElementById('danger-mass-confirm');

  input?.addEventListener('input', () => {
    const match = input.value.trim() === String(n);
    input.classList.toggle('valid', match);
    btnDel.disabled = !match;
  });

  btnDel?.addEventListener('click', async () => {
    btnDel.disabled = true;
    btnDel.textContent = 'Excluindo...';
    let erros = 0;
    for (const id of ids) {
      try { await executarExclusaoCascade(id); }
      catch { erros++; }
    }
    closeModal();
    _selectedIds.clear();
    const ok = ids.length - erros;
    if (ok > 0) toast(`${ok} aluno${ok !== 1 ? 's excluídos' : ' excluído'} com sucesso.`, 'success');
    if (erros > 0) toast(`${erros} exclusão(ões) falharam.`, 'error');
    await loadAlunos();
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
    await loadAlunos();
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  }
}

// ─── Modal: Ver Ficha ─────────────────────────────────────────────────────────
function modalVerFicha(aluno) {
  const docsLinhas = [];
  if (aluno.cpf)     docsLinhas.push(`<div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">CPF:</strong><span style="font-family:var(--font-mono)">${esc(aluno.cpf)}</span></div>`);
  if (aluno.rnm)     docsLinhas.push(`<div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">RNM:</strong><span style="font-family:var(--font-mono)">${esc(aluno.rnm)}</span></div>`);
  if (aluno.cnh_num) docsLinhas.push(`<div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">CNH:</strong><span style="font-family:var(--font-mono)">${esc(aluno.cnh_num)}</span></div>`);
  if (!docsLinhas.length) docsLinhas.push(`<div style="color:var(--text-tertiary)">Nenhum documento cadastrado</div>`);

  openModal(`Ficha do Aluno — ${aluno.nome.split(' ')[0]}`, `
    <div style="display:flex;flex-direction:column;gap:12px;font-size:13px">
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">Nome:</strong><span>${esc(aluno.nome)}</span></div>
      ${docsLinhas.join('')}
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">E-mail:</strong><span>${esc(aluno.email || '—')}</span></div>
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">Telefone:</strong><span>${esc(aluno.telefone || '—')}</span></div>
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">Nascimento:</strong><span>${aluno.data_nascimento || '—'}</span></div>
      <div style="display:flex;gap:12px"><strong style="width:120px;color:var(--text-secondary)">Situação:</strong><span><span class="badge ${aluno.status === 'ativo' ? 'badge-green' : 'badge-gray'}">${aluno.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></span></div>
      <hr style="border:0;border-top:1px solid var(--border-subtle);margin:6px 0"/>
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

// ─── Utils: Escapar HTML ──────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// ─── Masks ────────────────────────────────────────────────────────────────────
function maskCPF(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3)  return d;
  if (d.length <= 6)  return d.replace(/(\d{3})(\d+)/, '$1.$2');
  if (d.length <= 9)  return d.replace(/(\d{3})(\d{3})(\d+)/, '$1.$2.$3');
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
}
function maskTel(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2)  return d.length ? `(${d}` : d;
  if (d.length <= 6)  return d.replace(/(\d{2})(\d+)/, '($1) $2');
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d+)/, '($1) $2-$3');
  return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
}
function maskCEP(v) {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.length > 5 ? d.replace(/(\d{5})(\d+)/, '$1-$2') : d;
}
// RNM: 1 letra + 6 dígitos + traço + 1 letra/dígito  →  V123456-J
function maskRNM(v) {
  const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw.length) return '';
  const letra1 = /[A-Z]/.test(raw[0]) ? raw[0] : '';
  const resto  = letra1 ? raw.slice(1) : raw;
  const digitos = resto.replace(/\D/g, '').slice(0, 6);
  const verif   = resto.replace(/[^A-Z0-9]/g, '').slice(6, 7);
  let result = letra1 + digitos;
  if (digitos.length === 6 && verif) result += '-' + verif;
  return result;
}
// CNH: apenas 11 dígitos numéricos
function maskCNH(v) {
  return v.replace(/\D/g, '').slice(0, 11);
}

// ─── Bind masks para novo aluno ───────────────────────────────────────────────
function bindMasksNovoAluno() {
  const cpfEl = document.getElementById('f-cpf');
  const rnmEl = document.getElementById('f-rnm');
  const cnhEl = document.getElementById('f-cnh-num');
  const telEl = document.getElementById('f-tel');
  const cepEl = document.getElementById('f-cep');
  const ufEl  = document.getElementById('f-uf');

  if (cpfEl) { cpfEl.addEventListener('input', e => { e.target.value = maskCPF(e.target.value); }); cpfEl.setAttribute('maxlength','14'); cpfEl.setAttribute('inputmode','numeric'); }
  if (rnmEl) { rnmEl.addEventListener('input', e => { e.target.value = maskRNM(e.target.value); }); rnmEl.setAttribute('maxlength','9'); }
  if (cnhEl) { cnhEl.addEventListener('input', e => { e.target.value = maskCNH(e.target.value); }); cnhEl.setAttribute('maxlength','11'); cnhEl.setAttribute('inputmode','numeric'); }
  if (telEl) { telEl.addEventListener('input', e => { e.target.value = maskTel(e.target.value); }); telEl.setAttribute('maxlength','15'); telEl.setAttribute('inputmode','tel'); }
  if (cepEl) {
    cepEl.addEventListener('input', e => { e.target.value = maskCEP(e.target.value); });
    cepEl.addEventListener('blur',  e => buscarCEP(e.target.value, 'f-'));
    cepEl.setAttribute('maxlength','9'); cepEl.setAttribute('inputmode','numeric');
  }
  if (ufEl) {
    ufEl.addEventListener('input', e => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
    });
  }
}

// ─── Bind masks para editar aluno ─────────────────────────────────────────────
function bindMasksEditarAluno() {
  const cpfEl = document.getElementById('e-cpf');
  const rnmEl = document.getElementById('e-rnm');
  const cnhEl = document.getElementById('e-cnh-num');
  const telEl = document.getElementById('e-tel');
  const cepEl = document.getElementById('e-cep');
  const ufEl  = document.getElementById('e-uf');

  if (cpfEl) cpfEl.addEventListener('input', e => { e.target.value = maskCPF(e.target.value); });
  if (rnmEl) rnmEl.addEventListener('input', e => { e.target.value = maskRNM(e.target.value); });
  if (cnhEl) cnhEl.addEventListener('input', e => { e.target.value = maskCNH(e.target.value); });
  if (telEl) { telEl.addEventListener('input', e => { e.target.value = maskTel(e.target.value); }); telEl.setAttribute('maxlength','15'); }
  if (cepEl) {
    cepEl.addEventListener('input', e => { e.target.value = maskCEP(e.target.value); });
    cepEl.addEventListener('blur',  e => buscarCEP(e.target.value, 'e-'));
    cepEl.setAttribute('maxlength','9');
  }
  if (ufEl) ufEl.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  });
}

// ─── ViaCEP ───────────────────────────────────────────────────────────────────
async function buscarCEP(cep, prefix) {
  const c = cep.replace(/\D/g, '');
  if (c.length !== 8) return;
  try {
    const res  = await fetch(`https://viacep.com.br/ws/${c}/json/`);
    const data = await res.json();
    if (data.erro) { toast('CEP não encontrado', 'warning'); return; }
    document.getElementById(prefix + 'rua').value    = data.logradouro || '';
    document.getElementById(prefix + 'bairro').value = data.bairro    || '';
    document.getElementById(prefix + 'cidade').value = data.localidade || '';
    document.getElementById(prefix + 'uf').value     = data.uf        || '';
    document.getElementById(prefix + 'numero').focus();
    toast('Endereço preenchido via ViaCEP', 'success');
  } catch (_) {
    toast('Erro ao buscar CEP', 'error');
  }
}

// ─── Modal: Novo Aluno ────────────────────────────────────────────────────────
function modalNovoAluno() {
  const empresaOptions = _empresasCache.map(e =>
    `<option value="${e.id}">${esc(e.nome)}</option>`
  ).join('');

  openModal('Novo Aluno', `
    <form id="form-novo-aluno" novalidate role="form" aria-label="Cadastro de aluno">

      <!-- ── Identificação ───────────────────────────────────────────── -->
      <fieldset class="form-fieldset">
        <legend>Identificação</legend>

        <div class="input-row">
          <div class="form-group flex-2">
            <label for="f-nome">Nome Completo <span aria-hidden="true" style="color:var(--red)">*</span></label>
            <input id="f-nome" name="nome" type="text" placeholder="Ex: João da Silva"
                   autocomplete="name" aria-required="true" spellcheck="false">
          </div>
          <div class="form-group">
            <label for="f-nasc">Data de Nascimento</label>
            <input id="f-nasc" name="data_nascimento" type="date" autocomplete="bday">
          </div>
        </div>

        <div class="input-row">
          <div class="form-group">
            <label for="f-email">E-mail</label>
            <input id="f-email" name="email" type="email" placeholder="joao@email.com"
                   autocomplete="email" inputmode="email">
          </div>
          <div class="form-group">
            <label for="f-tel">Telefone / WhatsApp</label>
            <input id="f-tel" name="telefone" type="text" placeholder="(11) 99999-9999"
                   autocomplete="tel">
          </div>
        </div>
      </fieldset>

      <!-- ── Documentos ──────────────────────────────────────────────── -->
      <fieldset class="form-fieldset">
        <legend>Documentos</legend>

        <div class="doc-check-row" role="group" aria-label="Tipos de documento">
          <label class="doc-check-item active" id="label-check-cpf">
            <input type="checkbox" id="check-cpf" value="cpf" checked aria-controls="doc-cpf-field">
            CPF
          </label>
          <label class="doc-check-item" id="label-check-rnm">
            <input type="checkbox" id="check-rnm" value="rnm" aria-controls="doc-rnm-field">
            RNM
          </label>
          <label class="doc-check-item" id="label-check-cnh">
            <input type="checkbox" id="check-cnh" value="cnh" aria-controls="doc-cnh-field">
            CNH
          </label>
        </div>

        <div class="doc-fields">
          <div id="doc-cpf-field" class="doc-field-row visible">
            <div class="form-group">
              <label for="f-cpf">CPF <span aria-hidden="true" style="color:var(--red)">*</span></label>
              <input id="f-cpf" name="cpf" type="text" placeholder="000.000.000-00"
                     aria-required="true" autocomplete="off">
            </div>
          </div>

          <div id="doc-rnm-field" class="doc-field-row">
            <div class="form-group">
              <label for="f-rnm">RNM — Registro Nacional Migratório <span aria-hidden="true" style="color:var(--red)">*</span></label>
              <input id="f-rnm" name="rnm" type="text" placeholder="V123456-J"
                     autocomplete="off">
              <small style="color:var(--text-tertiary)">Formato: A000000-A — 1 letra + 6 dígitos + traço + 1 dígito/letra (ex: V123456-J)</small>
            </div>
          </div>

          <div id="doc-cnh-field" class="doc-field-row">
            <div class="form-group">
              <label for="f-cnh-num">CNH — Carteira Nacional de Habilitação <span aria-hidden="true" style="color:var(--red)">*</span></label>
              <input id="f-cnh-num" name="cnh_num" type="text" placeholder="00000000000"
                     autocomplete="off">
              <small style="color:var(--text-tertiary)">11 dígitos numéricos (padrão brasileiro e estrangeiros amparados pela Convenção de Viena)</small>
            </div>
          </div>
        </div>
      </fieldset>

      <!-- ── Vínculo Empresarial ─────────────────────────────────────── -->
      <fieldset class="form-fieldset">
        <legend>Vínculo Empresarial</legend>

        <div class="radio-row" role="radiogroup" aria-label="Vínculo com empresa">
          <label class="radio-item">
            <input type="radio" name="f-vinculo" value="nao" checked> Não vinculado
          </label>
          <label class="radio-item">
            <input type="radio" name="f-vinculo" value="sim"> Vinculado a empresa
          </label>
        </div>

        <div id="f-empresa-wrap" hidden aria-hidden="true" style="margin-top:14px">
          <div class="form-group">
            <label for="f-empresa">Empresa <span aria-hidden="true" style="color:var(--red)">*</span></label>
            <select id="f-empresa" autocomplete="organization">
              <option value="">— Selecione —</option>
              ${empresaOptions}
            </select>
          </div>
        </div>
      </fieldset>

      <!-- ── Endereço ────────────────────────────────────────────────── -->
      <fieldset class="form-fieldset">
        <legend>Endereço</legend>

        <div class="input-row">
          <div class="form-group">
            <label for="f-cep">CEP</label>
            <input id="f-cep" name="cep" type="text" placeholder="00000-000" autocomplete="postal-code">
          </div>
          <div class="form-group flex-2">
            <label for="f-rua">Logradouro</label>
            <input id="f-rua" name="rua" type="text" autocomplete="street-address">
          </div>
        </div>

        <div class="input-row">
          <div class="form-group">
            <label for="f-numero">Número</label>
            <input id="f-numero" name="numero" type="text">
          </div>
          <div class="form-group">
            <label for="f-complemento">Complemento</label>
            <input id="f-complemento" name="complemento" type="text">
          </div>
          <div class="form-group">
            <label for="f-bairro">Bairro</label>
            <input id="f-bairro" name="bairro" type="text">
          </div>
        </div>

        <div class="input-row">
          <div class="form-group flex-2">
            <label for="f-cidade">Cidade</label>
            <input id="f-cidade" name="cidade" type="text" autocomplete="address-level2">
          </div>
          <div class="form-group">
            <label for="f-uf">UF</label>
            <input id="f-uf" name="uf" type="text" maxlength="2"
                   autocomplete="address-level1" style="text-transform:uppercase">
          </div>
        </div>
      </fieldset>

      <!-- ── Observações ─────────────────────────────────────────────── -->
      <div class="form-group" style="margin-bottom:4px">
        <label for="f-obs">Observações</label>
        <textarea id="f-obs" name="observacoes" placeholder="Informações adicionais..." rows="3"></textarea>
      </div>

      <!-- ── Matrícula Automática ───────────────────────────────────── -->
      <fieldset class="form-fieldset" style="border-color:var(--accent);background:var(--accent-soft);margin-top:16px">
        <legend style="color:var(--accent);display:flex;align-items:center;gap:6px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
          Matrícula Automática
          <span style="font-size:11px;color:var(--text-tertiary);font-weight:400">(opcional)</span>
        </legend>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:14px;font-family:var(--font-mono);line-height:1.5">
          Selecione um curso para criar a matrícula automaticamente após o cadastro.<br>
          Se houver turma com vaga → o aluno já entra. Caso contrário → entra em espera.
        </p>
        <div class="form-group" style="margin-bottom:0">
          <label for="f-curso-auto">Curso de Interesse</label>
          <select id="f-curso-auto">
            <option value="">— Somente cadastrar o aluno —</option>
            ${_cursosCache.map(c => `<option value="${c.id}">${esc(c.nome)}${c.codigo ? ` (${esc(c.codigo)})` : ''}</option>`).join('')}
          </select>
        </div>
      </fieldset>

    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel" type="button">Cancelar</button>
      <button class="btn btn-primary" id="modal-save" type="submit">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
        Salvar Aluno
      </button>
    </div>
  `, true);

  // Masks
  bindMasksNovoAluno();

  // Validação em tempo real
  bindBlur('f-nome',  'Nome',     ['required']);
  bindBlur('f-email', 'E-mail',   ['email']);
  bindBlur('f-tel',   'Telefone', ['phone']);

  // Toggle de campos de documento (checkboxes)
  ['cpf', 'rnm', 'cnh'].forEach(tipo => {
    const cb    = document.getElementById(`check-${tipo}`);
    const field = document.getElementById(`doc-${tipo}-field`);
    const label = document.getElementById(`label-check-${tipo}`);
    if (!cb || !field || !label) return;

    cb.addEventListener('change', () => {
      field.classList.toggle('visible', cb.checked);
      label.classList.toggle('active', cb.checked);
    });
  });

  // Toggle empresa (radio buttons)
  document.querySelectorAll('input[name="f-vinculo"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const wrap   = document.getElementById('f-empresa-wrap');
      const hidden = radio.value === 'nao';
      wrap.hidden = hidden;
      wrap.setAttribute('aria-hidden', String(hidden));
      if (hidden) document.getElementById('f-empresa').value = '';
    });
  });

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => salvarNovoAluno());
}

// ─── INSERT real ──────────────────────────────────────────────────────────────
async function salvarNovoAluno() {
  const nome       = document.getElementById('f-nome')?.value.trim();
  const email      = document.getElementById('f-email')?.value.trim();
  const telefone   = document.getElementById('f-tel')?.value.trim();
  const nascimento = document.getElementById('f-nasc')?.value;
  const obs        = document.getElementById('f-obs')?.value.trim();

  const hasCPF = document.getElementById('check-cpf')?.checked;
  const hasRNM = document.getElementById('check-rnm')?.checked;
  const hasCNH = document.getElementById('check-cnh')?.checked;

  const cpfVal = hasCPF ? (document.getElementById('f-cpf')?.value.trim()     || null) : null;
  const rnmVal = hasRNM ? (document.getElementById('f-rnm')?.value.trim()     || null) : null;
  const cnhVal = hasCNH ? (document.getElementById('f-cnh-num')?.value.trim() || null) : null;

  const vinculo   = document.querySelector('input[name="f-vinculo"]:checked')?.value || 'nao';
  const empresaId = vinculo === 'sim' ? (document.getElementById('f-empresa')?.value || null) : null;
  const tipo      = empresaId ? 'empresa' : 'pessoa_fisica';

  const cep         = document.getElementById('f-cep')?.value.trim()         || null;
  const rua         = document.getElementById('f-rua')?.value.trim()         || null;
  const numero      = document.getElementById('f-numero')?.value.trim()      || null;
  const complemento = document.getElementById('f-complemento')?.value.trim() || null;
  const bairro      = document.getElementById('f-bairro')?.value.trim()      || null;
  const cidade      = document.getElementById('f-cidade')?.value.trim()      || null;
  const uf          = document.getElementById('f-uf')?.value.trim()          || null;

  // Pelo menos um documento é obrigatório
  if (!hasCPF && !hasRNM && !hasCNH) {
    toast('Selecione pelo menos um tipo de documento.', 'warning');
    return;
  }

  // Monta regras de validação dinamicamente
  const rules = [
    { id: 'f-nome',  value: nome,     rules: ['required'], label: 'Nome' },
    { id: 'f-email', value: email,    rules: ['email'],    label: 'E-mail' },
    { id: 'f-tel',   value: telefone, rules: ['phone'],    label: 'Telefone' },
  ];
  if (hasCPF) rules.push({ id: 'f-cpf',     value: cpfVal, rules: ['required', 'cpf'],            label: 'CPF' });
  if (hasRNM) rules.push({ id: 'f-rnm',     value: rnmVal, rules: ['required', 'rnm'],            label: 'RNM' });
  if (hasCNH) rules.push({ id: 'f-cnh-num', value: cnhVal, rules: ['required', 'cnh_estrangeiro'], label: 'CNH' });

  const ok = validateForm(rules);
  if (!ok) return;

  if (vinculo === 'sim' && !empresaId) {
    fieldError('f-empresa', 'Selecione a empresa.'); return;
  }
  fieldOk('f-empresa');

  const rawCep = (cep || '').replace(/\D/g, '');
  if (rawCep && rawCep.length !== 8) { fieldError('f-cep', 'CEP deve ter 8 dígitos.'); return; }
  fieldOk('f-cep');

  if (nascimento) {
    const age = (new Date() - new Date(nascimento)) / (1000 * 60 * 60 * 24 * 365.25);
    if (age < 16) { fieldError('f-nasc', 'Idade mínima: 16 anos.'); return; }
    fieldOk('f-nasc');
  }

  const saveBtn = document.getElementById('modal-save');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span aria-live="assertive">Salvando...</span>';

  // Captura o curso de interesse para matrícula automática
  const cursoAutoId = document.getElementById('f-curso-auto')?.value || null;

  try {
    const client = await getClient();
    const { data: inserted, error } = await client
      .from('alunos')
      .insert({
        tenant_id:       getTenantId(),
        nome,
        cpf:             cpfVal,
        rnm:             rnmVal,
        cnh_num:         cnhVal,
        email:           email     || null,
        telefone:        telefone  || null,
        data_nascimento: nascimento || null,
        tipo_pessoa:     tipo,
        empresa_id:      empresaId,
        observacoes:     obs || null,
        status:          'ativo',
        cep, rua, numero, complemento, bairro, cidade, uf
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') {
        const which = error.message?.includes('cpf') ? 'CPF'
                    : error.message?.includes('rnm') ? 'RNM'
                    : error.message?.includes('cnh') ? 'CNH'
                    : 'documento';
        throw new Error(`Já existe um aluno cadastrado com este ${which}.`);
      }
      throw error;
    }

    closeModal();

    // ── Matrícula automática se curso foi selecionado ─────────────────────
    if (cursoAutoId && inserted?.id) {
      const result = await criarMatriculaAutomatica(inserted.id, cursoAutoId);
      if (result.ok) {
        const msg = result.turma_code
          ? `Aluno cadastrado e matriculado na turma ${result.turma_code}!`
          : `Aluno cadastrado e adicionado à fila de espera do curso.`;
        toast(msg, 'success');
      } else {
        toast(`Aluno "${nome.split(' ')[0]}" cadastrado. Matrícula: ${result.reason}`, 'warning');
      }
    } else {
      toast(`Aluno "${nome.split(' ')[0]}" cadastrado com sucesso!`, 'success');
    }

    await loadAlunos();

  } catch (err) {
    toast(`Erro ao salvar: ${err.message}`, 'error');
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg> Salvar Aluno`;
  }
}

// ─── Modal: Editar Aluno ──────────────────────────────────────────────────────
function modalEditarAluno(aluno) {
  const empresaOptions = _empresasCache.map(e =>
    `<option value="${e.id}" ${e.id === aluno.empresa_id ? 'selected' : ''}>${esc(e.nome)}</option>`
  ).join('');

  openModal(`Editar — ${aluno.nome.split(' ')[0]}`, `
    <form id="form-editar-aluno" novalidate>

      <fieldset class="form-fieldset">
        <legend>Identificação</legend>
        <div class="input-row">
          <div class="form-group flex-2">
            <label for="e-nome">Nome Completo *</label>
            <input id="e-nome" type="text" value="${esc(aluno.nome)}">
          </div>
          <div class="form-group">
            <label for="e-nasc">Nascimento</label>
            <input id="e-nasc" type="date" value="${aluno.data_nascimento || ''}">
          </div>
        </div>
        <div class="input-row">
          <div class="form-group">
            <label for="e-email">E-mail</label>
            <input id="e-email" type="email" value="${esc(aluno.email ?? '')}">
          </div>
          <div class="form-group">
            <label for="e-tel">Telefone / WhatsApp</label>
            <input id="e-tel" type="text" value="${esc(aluno.telefone ?? '')}">
          </div>
        </div>
      </fieldset>

      <fieldset class="form-fieldset">
        <legend>Documentos</legend>
        <div class="input-row">
          <div class="form-group">
            <label for="e-cpf">CPF</label>
            <input id="e-cpf" type="text" value="${esc(aluno.cpf ?? '')}" placeholder="000.000.000-00">
          </div>
          <div class="form-group">
            <label for="e-rnm">RNM</label>
            <input id="e-rnm" type="text" value="${esc(aluno.rnm ?? '')}" placeholder="V123456-J">
          </div>
          <div class="form-group">
            <label for="e-cnh-num">CNH</label>
            <input id="e-cnh-num" type="text" value="${esc(aluno.cnh_num ?? '')}" placeholder="00000000000">
          </div>
        </div>
      </fieldset>

      <fieldset class="form-fieldset">
        <legend>Vínculo Empresarial</legend>
        <div class="input-row">
          <div class="form-group">
            <label for="e-tipo">Tipo de pessoa</label>
            <select id="e-tipo">
              <option value="pessoa_fisica" ${aluno.tipo_pessoa === 'pessoa_fisica' ? 'selected' : ''}>Pessoa Física</option>
              <option value="empresa"       ${aluno.tipo_pessoa === 'empresa'       ? 'selected' : ''}>Via Empresa</option>
            </select>
          </div>
          <div class="form-group flex-2">
            <label for="e-empresa">Empresa</label>
            <select id="e-empresa">
              <option value="">— Nenhuma —</option>
              ${empresaOptions}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset class="form-fieldset">
        <legend>Endereço</legend>
        <div class="input-row">
          <div class="form-group">
            <label for="e-cep">CEP</label>
            <input id="e-cep" type="text" placeholder="00000-000" value="${esc(aluno.cep || '')}">
          </div>
          <div class="form-group flex-2">
            <label for="e-rua">Logradouro</label>
            <input id="e-rua" type="text" value="${esc(aluno.rua || '')}">
          </div>
        </div>
        <div class="input-row">
          <div class="form-group">
            <label for="e-numero">Número</label>
            <input id="e-numero" type="text" value="${esc(aluno.numero || '')}">
          </div>
          <div class="form-group">
            <label for="e-complemento">Complemento</label>
            <input id="e-complemento" type="text" value="${esc(aluno.complemento || '')}">
          </div>
          <div class="form-group">
            <label for="e-bairro">Bairro</label>
            <input id="e-bairro" type="text" value="${esc(aluno.bairro || '')}">
          </div>
        </div>
        <div class="input-row">
          <div class="form-group flex-2">
            <label for="e-cidade">Cidade</label>
            <input id="e-cidade" type="text" value="${esc(aluno.cidade || '')}">
          </div>
          <div class="form-group">
            <label for="e-uf">UF</label>
            <input id="e-uf" type="text" maxlength="2" value="${esc(aluno.uf || '')}">
          </div>
        </div>
      </fieldset>

    </form>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-update" data-id="${aluno.id}">Salvar Alterações</button>
    </div>
  `, true);

  bindMasksEditarAluno();

  // Validação em tempo real nos campos obrigatórios da edição
  bindBlur('e-nome',  'Nome',     ['required']);
  if (aluno.email)    bindBlur('e-email', 'E-mail',   ['required', 'email']);
  else                bindBlur('e-email', 'E-mail',   ['email']);
  if (aluno.telefone) bindBlur('e-tel',   'Telefone', ['required', 'phone']);
  else                bindBlur('e-tel',   'Telefone', ['phone']);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-update')?.addEventListener('click', () => atualizarAluno(aluno.id, aluno));
}

// ─── UPDATE real ──────────────────────────────────────────────────────────────
async function atualizarAluno(id, alunoOriginal = {}) {
  const nome        = document.getElementById('e-nome')?.value.trim();
  const email       = document.getElementById('e-email')?.value.trim();
  const telefone    = document.getElementById('e-tel')?.value.trim();
  const nascimento  = document.getElementById('e-nasc')?.value || null;
  const tipo        = document.getElementById('e-tipo')?.value;
  const empresaId   = document.getElementById('e-empresa')?.value || null;
  const cpfVal      = document.getElementById('e-cpf')?.value.trim() || null;
  const rnmVal      = document.getElementById('e-rnm')?.value.trim() || null;
  const cnhVal      = document.getElementById('e-cnh-num')?.value.trim() || null;

  const cep         = document.getElementById('e-cep')?.value.trim()         || null;
  const rua         = document.getElementById('e-rua')?.value.trim()         || null;
  const numero      = document.getElementById('e-numero')?.value.trim()      || null;
  const complemento = document.getElementById('e-complemento')?.value.trim() || null;
  const bairro      = document.getElementById('e-bairro')?.value.trim()      || null;
  const cidade      = document.getElementById('e-cidade')?.value.trim()      || null;
  const uf          = document.getElementById('e-uf')?.value.trim()          || null;

  // ── Campos obrigatórios: nome sempre; email e telefone se já tinham valor ──
  const emailRules    = alunoOriginal.email    ? ['required', 'email'] : ['email'];
  const telefoneRules = alunoOriginal.telefone ? ['required', 'phone'] : ['phone'];

  const ok = validateForm([
    { id: 'e-nome',  value: nome,     rules: ['required'],   label: 'Nome' },
    { id: 'e-email', value: email,    rules: emailRules,     label: 'E-mail' },
    { id: 'e-tel',   value: telefone, rules: telefoneRules,  label: 'Telefone' },
  ]);
  if (!ok) return;

  const rawCep = (cep || '').replace(/\D/g, '');
  if (rawCep && rawCep.length !== 8) { fieldError('e-cep', 'CEP inválido.'); return; }
  fieldOk('e-cep');

  // Pelo menos um documento deve permanecer preenchido
  if (!cpfVal && !rnmVal && !cnhVal) {
    toast('Pelo menos um documento (CPF, RNM ou CNH) deve permanecer preenchido.', 'warning');
    return;
  }

  const updateBtn = document.getElementById('modal-update');
  updateBtn.disabled = true;
  updateBtn.textContent = 'Salvando...';

  try {
    const client = await getClient();
    const { error } = await client
      .from('alunos')
      .update({
        nome,
        cpf:             cpfVal,
        rnm:             rnmVal,
        cnh_num:         cnhVal,
        email:           email    || null,
        telefone:        telefone || null,
        data_nascimento: nascimento,
        tipo_pessoa:     tipo,
        empresa_id:      empresaId,
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

// ─── Exportar CSV ─────────────────────────────────────────────────────────────
function exportarCSV() {
  if (!_alunosCache.length) { toast('Nenhum dado para exportar.', 'warning'); return; }
  const headers = ['Nome','CPF','RNM','CNH','Email','Telefone','Tipo','Empresa','Status'];
  const rows = _alunosCache.map(a => [
    a.nome,
    a.cpf     ?? '',
    a.rnm     ?? '',
    a.cnh_num ?? '',
    a.email   ?? '',
    a.telefone ?? '',
    a.tipo_pessoa,
    a.empresa_nome,
    a.status,
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'alunos.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('Exportação concluída!', 'success');
}
