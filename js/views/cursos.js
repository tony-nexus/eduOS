/**
 * /js/views/cursos.js
 * CRUD real para Cursos via Supabase.
 * Melhorias:
 *  - Campo Valor com máscara R$ (type=text + formatação BRL)
 *  - Validade passa a ser obrigatória
 *  - Botão Excluir com modal de confirmação
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast, fmtMoney } from '../ui/components.js';
import { validateForm, fieldError, fieldOk, bindBlur } from '../ui/validate.js';

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
      <td style="font-size:12.5px">${c.validade_meses ? c.validade_meses + ' meses' : '<span class="badge badge-purple">Vitalício</span>'}</td>
      <td style="font-family:var(--font-mono);font-size:12.5px;color:var(--green)">${c.valor_padrao ? fmtMoney(c.valor_padrao) : '—'}</td>
      <td><span class="badge ${c.ativo !== false ? 'badge-green' : 'badge-gray'}">${c.ativo !== false ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="action-btn" data-action="editar" data-id="${c.id}">Editar</button>
          <button class="action-btn danger" data-action="excluir" data-id="${c.id}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.action-btn[data-action="editar"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const curso = _cache.find(cx => cx.id == btn.dataset.id);
      if (curso) modalCurso(curso);
    });
  });

  document.querySelectorAll('.action-btn[data-action="excluir"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const curso = _cache.find(cx => cx.id == btn.dataset.id);
      if (curso) confirmarExclusaoCurso(curso);
    });
  });
}

// ─── Máscara R$ ───────────────────────────────────────────────────────────────
function aplicarMascaraReais(input) {
  input.addEventListener('input', () => {
    let raw = input.value.replace(/\D/g, '');
    if (!raw) { input.value = ''; return; }
    const cents = parseInt(raw, 10);
    input.value = (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  });
}

function parseBRL(str) {
  if (!str) return null;
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || null;
}

// ─── Modal Curso ───────────────────────────────────────────────────────────────
function modalCurso(curso = null) {
  const isEdit    = !!curso;
  const vitalicio = isEdit && curso.validade_meses === null;
  const valorStr  = curso?.valor_padrao
    ? curso.valor_padrao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  openModal(isEdit ? 'Editar Curso' : 'Novo Curso', `
    <div class="form-grid">

      <div class="form-group full">
        <label>Nome do Curso <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <input id="f-nome" type="text" value="${curso?.nome || ''}" placeholder="Ex: NR-35 Trabalho em Altura">
      </div>

      <div class="form-group">
        <label>Código (Sigla) <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <input id="f-cod" type="text" value="${curso?.codigo || ''}" placeholder="Ex: NR35">
      </div>

      <div class="form-group">
        <label>Carga Horária (h) <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <input id="f-ch" type="number" min="1" max="9000"
          value="${curso?.carga_horaria || ''}" placeholder="Ex: 8">
        <small style="color:var(--text-tertiary);font-size:11px">Máximo: 9.000 horas</small>
      </div>

      <div class="form-group">
        <label>Valor Padrão (R$) <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <input id="f-valor" type="text" inputmode="numeric" value="${valorStr}" placeholder="0,00"
          style="font-family:var(--font-mono)">
        <small style="color:var(--text-tertiary);font-size:11px">Máximo: R$ 100.000,00</small>
      </div>

      <div class="form-group full">
        <label>Validade do Certificado <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <label class="radio-item" style="margin-bottom:10px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:13px">
          <input type="checkbox" id="f-vitalicio" ${vitalicio ? 'checked' : ''}>
          Vitalício <span style="font-size:11.5px;color:var(--text-tertiary);font-family:var(--font-mono)">(sem prazo de expiração)</span>
        </label>
        <div id="f-val-wrap" ${vitalicio ? 'hidden' : ''}>
          <input id="f-val" type="number" min="1" max="600"
            value="${curso?.validade_meses ?? ''}" placeholder="Ex: 24">
          <small style="color:var(--text-tertiary);font-size:11px">Em meses — máximo 600 (50 anos)</small>
        </div>
      </div>

      <div class="form-group">
        <label>Status</label>
        <select id="f-ativo">
          <option value="true"  ${curso?.ativo !== false ? 'selected' : ''}>Ativo</option>
          <option value="false" ${curso?.ativo === false  ? 'selected' : ''}>Inativo</option>
        </select>
      </div>

    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary"   id="modal-save">${isEdit ? 'Salvar Alterações' : 'Criar Curso'}</button>
    </div>
  `);

  aplicarMascaraReais(document.getElementById('f-valor'));

  // Toggle vitalício
  document.getElementById('f-vitalicio')?.addEventListener('change', e => {
    const wrap = document.getElementById('f-val-wrap');
    wrap.hidden = e.target.checked;
    if (e.target.checked) {
      const input = document.getElementById('f-val');
      if (input) { input.value = ''; fieldOk('f-val'); }
    }
  });

  bindBlur('f-nome', 'Nome',          ['required']);
  bindBlur('f-cod',  'Código',        ['required']);
  bindBlur('f-ch',   'Carga horária', ['required', 'int_positive']);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click',   () => saveCurso(curso?.id));
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function saveCurso(id) {
  const nome      = document.getElementById('f-nome').value.trim();
  const cod       = document.getElementById('f-cod').value.trim();
  const ch        = parseInt(document.getElementById('f-ch').value) || null;
  const isVital   = document.getElementById('f-vitalicio')?.checked ?? false;
  const validade  = isVital ? null : (parseInt(document.getElementById('f-val').value) || null);
  const valorRaw  = document.getElementById('f-valor').value.trim();
  const valor     = parseBRL(valorRaw);
  const ativo     = document.getElementById('f-ativo').value === 'true';

  // Regras base sempre obrigatórias
  const rules = [
    { id: 'f-nome', value: nome, rules: ['required'],             label: 'Nome' },
    { id: 'f-cod',  value: cod,  rules: ['required'],             label: 'Código' },
    { id: 'f-ch',   value: ch,   rules: ['required', 'int_positive'], label: 'Carga horária' },
  ];
  // Validade obrigatória apenas se não for vitalício
  if (!isVital) {
    rules.push({ id: 'f-val', value: validade, rules: ['required', 'int_positive'], label: 'Validade' });
  }

  const ok = validateForm(rules);
  if (!ok) return;

  // ── Limite: carga horária ≤ 9.000h ───────────────────────────────────────
  if (ch > 9000) {
    fieldError('f-ch', 'Carga horária não pode ultrapassar 9.000 horas.');
    return;
  }
  fieldOk('f-ch');

  // ── Limite: validade ≤ 600 meses (se não vitalício) ──────────────────────
  if (!isVital && validade > 600) {
    fieldError('f-val', 'Validade não pode ultrapassar 600 meses (50 anos).');
    return;
  }
  if (!isVital) fieldOk('f-val');

  // ── Valor obrigatório e ≤ R$ 100.000 ─────────────────────────────────────
  if (!valor || valor <= 0) {
    fieldError('f-valor', 'Informe o valor padrão do curso.');
    return;
  }
  if (valor > 100000) {
    fieldError('f-valor', 'Valor não pode ultrapassar R$ 100.000,00.');
    return;
  }
  fieldOk('f-valor');

  const payload = {
    tenant_id: getTenantId(),
    nome, codigo: cod,
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
      ({ error } = await supabase.from('cursos').update(payload).eq('id', id).eq('tenant_id', getTenantId()));
    } else {
      ({ error } = await supabase.from('cursos').insert(payload));
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

// ─── Excluir Curso ─────────────────────────────────────────────────────────────
function confirmarExclusaoCurso(curso) {
  openModal('Excluir Curso', `
    <div class="danger-banner">
      <div class="danger-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </div>
      <div class="danger-banner-info">
        <div class="danger-banner-title">Excluir curso permanentemente</div>
        <div class="danger-banner-sub">${curso.nome} · ${curso.codigo || ''}</div>
      </div>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.6">
      Esta ação é irreversível. Turmas e matrículas vinculadas a este curso <strong style="color:var(--red)">podem ser afetadas</strong>.
    </p>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-danger" id="btn-confirmar-exclusao">Excluir Curso</button>
    </div>
  `);
  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('btn-confirmar-exclusao')?.addEventListener('click', () => excluirCurso(curso.id));
}

async function excluirCurso(id) {
  const btn = document.getElementById('btn-confirmar-exclusao');
  btn.disabled = true;
  btn.textContent = 'Excluindo...';
  try {
    const { error } = await supabase.from('cursos').delete().eq('id', id).eq('tenant_id', getTenantId());
    if (error) throw error;
    closeModal();
    toast('Curso excluído com sucesso.', 'success');
    await loadData();
  } catch (err) {
    toast(`Erro ao excluir: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Excluir Curso';
  }
}
