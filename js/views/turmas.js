/**
 * /js/views/turmas.js
 * CRUD real para Turmas via Supabase.
 *
 * MELHORIAS APLICADAS:
 *  - Código da turma gerado AUTOMATICAMENTE no padrão: SIGLA-ANO-SEQ (ex: NR35-2025-003)
 *  - Campo código readonly no modal → gerado ao selecionar curso + data início
 *  - Ocupação real lida da coluna 'ocupadas' (sem mock de 80%)
 *  - Filtro de turmas por curso no modal de matrícula exportado via _turmasCache
 *  - XSS escape em valores interpolados no HTML
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast, fmtDate, esc } from '../ui/components.js';
import { validateForm, fieldError, fieldOk } from '../ui/validate.js';
import { autoSyncTurmaStatus, autoEnrollAguardando, autoEmitirCertificados } from '../core/automations.js';
import { initDatePicker } from '../ui/date-picker.js';

let _turmas      = [];
let _cursos      = [];
let _instrutores = [];
let _empresas    = [];
let _filterPickers = [];

export let _turmasCache = []; // acessado por matriculas.js

const BADGE = { agendada:'badge-blue', em_andamento:'badge-amber', concluida:'badge-green', cancelada:'badge-red' };
const LABEL = { agendada:'Agendada', em_andamento:'Em Andamento', concluida:'Concluída', cancelada:'Cancelada' };

// ─── Status calculado pelas datas ──────────────────────────────────────────────
function calcularStatusPorData(inicio, fim) {
  if (!inicio) return 'agendada';
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const di   = new Date(inicio + 'T00:00:00');
  const df   = fim ? new Date(fim + 'T00:00:00') : null;
  if (di > hoje)              return 'agendada';
  if (df && df < hoje)        return 'concluida';
  return 'em_andamento';
}

// ─── Render principal ─────────────────────────────────────────────────────────
export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Turmas</h1><p>Agendamento e controle de turmas</p></div>
      <div class="page-header-actions">
        <button class="btn btn-secondary" id="btn-exportar-csv">
          Exportar CSV
        </button>
        <button class="btn btn-secondary" id="btn-exportar-pdf">
          Exportar PDF
        </button>
        <button class="btn btn-primary" id="btn-nova-turma">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nova Turma
        </button>
      </div>
    </div>
    <div class="stats-row" id="turmas-kpis">
      ${Array(4).fill('<div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>').join('')}
    </div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-turmas" placeholder="Código ou curso...">
        </div>
        <select class="select-input" id="filtro-curso-turma">
          <option value="">Todos os cursos</option>
        </select>
        <select class="select-input" id="filtro-inst-turma">
          <option value="">Todos os instrutores</option>
        </select>
        <select class="select-input" id="filtro-status-turma">
          <option value="">Todos os status</option>
          <option value="agendada">Agendada</option>
          <option value="em_andamento">Em Andamento</option>
          <option value="concluida">Concluída</option>
          <option value="cancelada">Cancelada</option>
        </select>
        <div style="display:flex;align-items:center;gap:4px">
          <input type="text" class="select-input dp-input" id="filtro-turma-de"  placeholder="DD/MM/AAAA" style="width:110px">
          <span style="color:var(--text-tertiary);font-size:13px">–</span>
          <input type="text" class="select-input dp-input" id="filtro-turma-ate" placeholder="DD/MM/AAAA" style="width:110px">
        </div>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>Código</th><th>Curso</th><th>Instrutor</th>
            <th>Período</th><th>Vagas</th><th>Status</th><th>Ações</th>
          </tr></thead>
          <tbody id="turmas-tbody">
            <tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-tertiary)">
              <div class="skeleton" style="width:16px;height:16px;border-radius:50%;display:inline-block"></div> Carregando...
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `);

  document.getElementById('btn-nova-turma')?.addEventListener('click', () => modalTurma());
  document.getElementById('btn-exportar-csv')?.addEventListener('click', exportarCSV);
  document.getElementById('btn-exportar-pdf')?.addEventListener('click', exportarPDF);
  document.getElementById('search-turmas')?.addEventListener('input', applyFilter);
  document.getElementById('filtro-status-turma')?.addEventListener('change', applyFilter);
  document.getElementById('filtro-curso-turma')?.addEventListener('change', applyFilter);
  document.getElementById('filtro-inst-turma')?.addEventListener('change', applyFilter);

  await Promise.all([loadTurmas(), loadCursos(), loadInstrutores(), loadEmpresas()]);

  // Date pickers do filtro de período
  _filterPickers.forEach(p => { try { p.destroy(); } catch {} });
  _filterPickers = [];
  const pDe  = document.getElementById('filtro-turma-de');
  const pAte = document.getElementById('filtro-turma-ate');
  if (pDe)  _filterPickers.push(initDatePicker(pDe,  { onChange: applyFilter }));
  if (pAte) _filterPickers.push(initDatePicker(pAte, { onChange: applyFilter }));

  // ── Auto-sync de status por data (agendada→em_andamento→concluida) ──────
  autoSyncTurmaStatus().then(count => {
    if (count > 0) {
      toast(`${count} turma(s) avançada(s) automaticamente por data.`, 'info');
      loadTurmas();
    }
  });

  const fCurso = document.getElementById('filtro-curso-turma');
  if (fCurso) _cursos.forEach(c => fCurso.innerHTML += `<option value="${c.id}">${esc(c.nome)}</option>`);
  
  const fInst = document.getElementById('filtro-inst-turma');
  if (fInst) _instrutores.forEach(i => fInst.innerHTML += `<option value="${i.id}">${esc(i.nome)}</option>`);
}

// ─── Fetches ──────────────────────────────────────────────────────────────────
async function loadCursos() {
  try {
    const { data } = await supabase.from('cursos')
      .select('id, nome, codigo')
      .eq('tenant_id', getTenantId()).eq('ativo', true).order('nome');
    _cursos = data || [];
  } catch(_) { _cursos = []; }
}

async function loadInstrutores() {
  try {
    const { data } = await supabase.from('instrutores')
      .select('id, nome').eq('tenant_id', getTenantId()).order('nome');
    _instrutores = data || [];
  } catch(_) { _instrutores = []; }
}

async function loadEmpresas() {
  try {
    const { data } = await supabase.from('empresas')
      .select('id, nome').eq('tenant_id', getTenantId()).order('nome');
    _empresas = data || [];
  } catch(_) { _empresas = []; }
}

async function loadTurmas() {
  try {
    const { data, error } = await supabase
      .from('turmas')
      .select('*, curso:curso_id(id, nome, codigo), instrutor:instrutor_id(nome)')
      .eq('tenant_id', getTenantId())
      .order('data_inicio', { ascending: false });

    if (error) throw error;
    _turmas = (data || []).map(t => ({
      ...t,
      curso_nome:     t.curso?.nome      || '—',
      curso_codigo:   t.curso?.codigo    || '',
      instrutor_nome: t.instrutor?.nome  || '—',
    }));
    _turmasCache = _turmas; // exporta para matriculas.js
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar turmas', 'error');
    _turmas = [];
  }
  renderKPIs(_turmas);
  applyFilter();
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function renderKPIs(turmas) {
  const ag  = turmas.filter(t => t.status === 'agendada').length;
  const em  = turmas.filter(t => t.status === 'em_andamento').length;
  const con = turmas.filter(t => t.status === 'concluida').length;
  const can = turmas.filter(t => t.status === 'cancelada').length;
  const el = document.getElementById('turmas-kpis');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Agendadas</div><div class="stat-value" style="color:var(--blue)">${ag}</div></div>
    <div class="stat-card"><div class="stat-label">Em Andamento</div><div class="stat-value" style="color:var(--accent)">${em}</div></div>
    <div class="stat-card"><div class="stat-label">Concluídas</div><div class="stat-value" style="color:var(--green)">${con}</div></div>
    <div class="stat-card"><div class="stat-label">Canceladas</div><div class="stat-value" style="color:var(--red)">${can}</div></div>
  `;
}

// ─── Filtro / tabela ──────────────────────────────────────────────────────────
function applyFilter() {
  const q   = (document.getElementById('search-turmas')?.value || '').toLowerCase();
  const st  = document.getElementById('filtro-status-turma')?.value || '';
  const cr  = document.getElementById('filtro-curso-turma')?.value || '';
  const is  = document.getElementById('filtro-inst-turma')?.value || '';
  const de  = document.getElementById('filtro-turma-de')?.value || '';
  const ate = document.getElementById('filtro-turma-ate')?.value || '';

  const f  = _turmas.filter(t =>
    (!q   || t.codigo?.toLowerCase().includes(q) || t.curso_nome.toLowerCase().includes(q)) &&
    (!st  || t.status === st) &&
    (!cr  || t.curso_id === cr) &&
    (!is  || t.instrutor_id === is) &&
    (!de  || (t.data_inicio && t.data_inicio >= de)) &&
    (!ate || (t.data_inicio && t.data_inicio <= ate))
  );
  const tbody = document.getElementById('turmas-tbody');
  if (!tbody) return;
  if (!f.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-tertiary)">Nenhuma turma encontrada.</td></tr>`;
    return;
  }
  tbody.innerHTML = f.map(t => {
    const pct = t.vagas > 0 ? Math.round((t.ocupadas || 0) / t.vagas * 100) : 0;
    const pctColor = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--accent)';
    return `
    <tr>
      <td><span style="font-family:var(--font-mono);font-size:12px;color:var(--accent)">${esc(t.codigo || '—')}</span></td>
      <td style="font-weight:500">${esc(t.curso_nome)}</td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${esc(t.instrutor_nome)}</td>
      <td style="font-size:12px;color:var(--text-secondary);white-space:nowrap">
        ${t.data_inicio ? fmtDate(t.data_inicio) : '—'} – ${t.data_fim ? fmtDate(t.data_fim) : '—'}
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="progress-bar" style="width:60px">
            <div class="progress-fill" style="width:${pct}%;background:${pctColor}"></div>
          </div>
          <span style="font-size:11.5px;color:var(--text-tertiary)">${t.ocupadas || 0}/${t.vagas || 0}</span>
        </div>
      </td>
      <td><span class="badge ${BADGE[t.status] ?? 'badge-gray'}">${LABEL[t.status] ?? t.status}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="action-btn action-alunos" data-id="${t.id}">Alunos</button>
          ${['agendada','em_andamento'].includes(t.status) ? `
            <button class="action-btn action-editar" data-id="${t.id}">Editar</button>
            <button class="action-btn action-encerrar" data-id="${t.id}" style="color:var(--amber);border-color:var(--amber)">Encerrar</button>
          ` : ''}
          <button class="action-btn danger action-excluir-turma" data-id="${t.id}">Excluir</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.action-alunos').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = _turmas.find(x => x.id === btn.dataset.id);
      if (t) verAlunos(t);
    });
  });

  document.querySelectorAll('.action-editar').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = _turmas.find(x => x.id === btn.dataset.id);
      if (t) modalTurma(t);
    });
  });

  document.querySelectorAll('.action-encerrar').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = _turmas.find(x => x.id === btn.dataset.id);
      if (t) encerrarTurma(t);
    });
  });

  document.querySelectorAll('.action-excluir-turma').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = _turmas.find(x => x.id === btn.dataset.id);
      if (t) confirmarExclusaoTurma(t);
    });
  });
}

// ─── Geração automática do código de turma ────────────────────────────────────
/**
 * Gera código no formato: SIGLA-ANO-SEQ
 * Ex: NR35-2025-003
 *
 * Algoritmo:
 *  1. Pega o codigo do curso selecionado (ex: 'NR-35' → normaliza para 'NR35')
 *  2. Extrai o ano da data de início
 *  3. Conta quantas turmas desse curso já existem nesse ano → seq = count + 1
 *  4. Formata com zero-padding: 001, 002 ...
 */
async function gerarCodigoTurma(cursoId, dataInicio) {
  if (!cursoId || !dataInicio) return '';
  const curso = _cursos.find(c => c.id === cursoId);
  if (!curso) return '';

  // Normaliza sigla: remove hífen e espaços, uppercase
  const sigla = (curso.codigo || curso.nome.substring(0, 5))
    .toUpperCase().replace(/[\s\-]/g, '');
  const ano = new Date(dataInicio + 'T00:00:00').getFullYear();
  const prefixo = `${sigla}-${ano}`;

  try {
    const { data, error } = await supabase
      .from('turmas')
      .select('codigo')
      .eq('tenant_id', getTenantId())
      .like('codigo', `${prefixo}-%`)
      .order('codigo', { ascending: false })
      .limit(1);

    if (error) throw error;

    let nextSeq = 1;
    if (data && data.length > 0 && data[0].codigo) {
      const parts = data[0].codigo.split('-');
      const lastSeqStr = parts[parts.length - 1];
      const lastSeq = parseInt(lastSeqStr, 10);
      if (!isNaN(lastSeq)) {
        nextSeq = lastSeq + 1;
      }
    }

    const seq = String(nextSeq).padStart(3, '0');
    return `${prefixo}-${seq}`;
  } catch (_) {
    return `${prefixo}-001`;
  }
}

// ─── Modal Turma ──────────────────────────────────────────────────────────────
function modalTurma(turma = null) {
  const isEdit = !!turma;
  const cursosOpts = _cursos.map(c =>
    `<option value="${c.id}" data-codigo="${esc(c.codigo)}" ${turma?.curso_id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`
  ).join('');
  const instOpts = _instrutores.map(i =>
    `<option value="${i.id}" ${turma?.instrutor_id === i.id ? 'selected' : ''}>${esc(i.nome)}</option>`
  ).join('');

  // Detecta tipo de local para pré-selecionar no edit
  let localTipo = '';
  let localEmpresa = '';
  if (turma?.local) {
    if (turma.local === 'Interno' || turma.local === 'Online') {
      localTipo = turma.local;
    } else {
      localTipo = 'Empresa';
      localEmpresa = turma.local;
    }
  }
  const empresasOpts = _empresas.map(e =>
    `<option value="${esc(e.nome)}" ${localEmpresa === e.nome ? 'selected' : ''}>${esc(e.nome)}</option>`
  ).join('');

  const statusInicial = turma
    ? (turma.status === 'cancelada' ? 'cancelada' : calcularStatusPorData(turma.data_inicio, turma.data_fim))
    : calcularStatusPorData('', '');

  openModal(isEdit ? 'Editar Turma' : 'Nova Turma', `
    <div class="form-grid">

      <div class="form-group">
        <label>Curso <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <select id="f-curso" ${isEdit ? 'disabled' : ''}>
          <option value="">— Selecione —</option>
          ${cursosOpts}
        </select>
      </div>

      <div class="form-group">
        <label>Instrutor <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <select id="f-instrutor">
          <option value="">— Selecione —</option>
          ${instOpts}
        </select>
      </div>

      <div class="form-group full">
        <label>Código da Turma</label>
        <input id="f-codigo" type="text"
          value="${esc(turma?.codigo || '')}"
          placeholder="Gerado automaticamente…"
          readonly
          style="font-family:var(--font-mono);letter-spacing:0.5px;background:var(--bg-overlay);cursor:not-allowed;opacity:0.8">
        <small style="color:var(--text-tertiary);font-size:11px">
          ${isEdit ? '🔒 Código é imutável após criação.' : 'Preenchido automaticamente ao selecionar curso e data de início.'}
        </small>
      </div>

      <div class="form-group">
        <label>Data Início <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <input id="f-inicio" type="text" class="dp-input" placeholder="Selecione a data" readonly value="${esc(turma?.data_inicio || '')}">
      </div>

      <div class="form-group">
        <label>Data Fim <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <input id="f-fim" type="text" class="dp-input" placeholder="Selecione a data" readonly value="${esc(turma?.data_fim || '')}">
      </div>

      <div class="form-group">
        <label>Vagas <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <input id="f-vagas" type="number" min="1" max="31" value="${turma?.vagas || 20}">
        <small style="color:var(--text-tertiary);font-size:11px">Máximo de 31 alunos por turma.</small>
      </div>

      <div class="form-group">
        <label>Local / Modalidade <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <select id="f-local-tipo">
          <option value="">— Selecione —</option>
          <option value="Interno" ${localTipo === 'Interno' ? 'selected' : ''}>Interno</option>
          <option value="Online"  ${localTipo === 'Online'  ? 'selected' : ''}>Online</option>
          <option value="Empresa" ${localTipo === 'Empresa' ? 'selected' : ''}>Empresa</option>
        </select>
      </div>

      <div class="form-group" id="f-empresa-wrap" style="display:${localTipo === 'Empresa' ? 'block' : 'none'}">
        <label>Empresa <span style="color:var(--red)" aria-hidden="true">*</span></label>
        <select id="f-local-empresa">
          <option value="">— Selecione a empresa —</option>
          ${empresasOpts}
        </select>
      </div>

      <div class="form-group full">
        <label>Status</label>
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0">
          <span class="badge ${BADGE[statusInicial] ?? 'badge-gray'}" id="f-status-badge">${LABEL[statusInicial] ?? statusInicial}</span>
          <input type="hidden" id="f-status" value="${statusInicial}">
          <span style="font-size:11.5px;color:var(--text-tertiary);font-family:var(--font-mono)">
            Calculado automaticamente pelas datas informadas
          </span>
        </div>
      </div>

    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Salvar Alterações' : 'Criar Turma'}</button>
    </div>
  `);

  // ── Date pickers ─────────────────────────────────────────────────────────
  {
    const minDate = !isEdit ? (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })() : null;
    initDatePicker(document.getElementById('f-inicio'), { minDate });
    initDatePicker(document.getElementById('f-fim'),    { minDate });
  }

  // ── Auto-geração de código apenas para turmas novas ──────────────────────
  async function triggerAutoCode() {
    if (isEdit) return; // código é chave - não sobrescreve em edições
    const cursoId    = document.getElementById('f-curso')?.value;
    const dataInicio = document.getElementById('f-inicio')?.value;
    if (!cursoId || !dataInicio) return;
    const codigo = await gerarCodigoTurma(cursoId, dataInicio);
    const input  = document.getElementById('f-codigo');
    if (input) input.value = codigo;
  }

  // ── Atualiza badge de status ao mudar datas ──────────────────────────────
  function atualizarStatusBadge() {
    const inicio = document.getElementById('f-inicio')?.value;
    const fim    = document.getElementById('f-fim')?.value;
    const statusAtual = turma?.status === 'cancelada' ? 'cancelada' : calcularStatusPorData(inicio, fim);
    const badge  = document.getElementById('f-status-badge');
    const hidden = document.getElementById('f-status');
    if (badge) {
      badge.className = `badge ${BADGE[statusAtual] ?? 'badge-gray'}`;
      badge.textContent = LABEL[statusAtual] ?? statusAtual;
    }
    if (hidden) hidden.value = statusAtual;
  }

  document.getElementById('f-inicio')?.addEventListener('change', () => {
    atualizarStatusBadge();
    if (!isEdit) triggerAutoCode();
  });
  document.getElementById('f-fim')?.addEventListener('change', atualizarStatusBadge);

  if (!isEdit) {
    document.getElementById('f-curso')?.addEventListener('change', triggerAutoCode);
    triggerAutoCode();
  }

  document.getElementById('f-local-tipo')?.addEventListener('change', function () {
    const wrap = document.getElementById('f-empresa-wrap');
    if (wrap) wrap.style.display = this.value === 'Empresa' ? 'block' : 'none';
    if (this.value !== 'Empresa') {
      const sel = document.getElementById('f-local-empresa');
      if (sel) sel.value = '';
    }
  });

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => saveTurma(turma?.id));
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function saveTurma(id) {
  const codigo       = document.getElementById('f-codigo')?.value.trim();
  const curso_id     = document.getElementById('f-curso')?.value;
  const instrutor_id = document.getElementById('f-instrutor')?.value || null;
  const inicio       = document.getElementById('f-inicio')?.value || null;
  const fim          = document.getElementById('f-fim')?.value || null;
  const vagas        = parseInt(document.getElementById('f-vagas')?.value) || 0;
  const localTipo    = document.getElementById('f-local-tipo')?.value || '';
  const localEmpresa = document.getElementById('f-local-empresa')?.value || '';
  const local        = localTipo === 'Empresa' ? localEmpresa : localTipo;
  const status       = document.getElementById('f-status')?.value;

  const rules = [
    { id: 'f-codigo',     value: codigo,          rules: ['required'],               label: 'Código' },
    { id: 'f-curso',      value: curso_id,         rules: ['required'],               label: 'Curso' },
    { id: 'f-instrutor',  value: instrutor_id,     rules: ['required'],               label: 'Instrutor' },
    { id: 'f-inicio',     value: inicio,           rules: ['required'],               label: 'Data de início' },
    { id: 'f-fim',        value: fim,              rules: ['required'],               label: 'Data de fim' },
    { id: 'f-vagas',      value: vagas.toString(), rules: ['required','int_positive'], label: 'Vagas' },
    { id: 'f-local-tipo', value: localTipo,        rules: ['required'],               label: 'Local / Modalidade' },
  ];
  if (localTipo === 'Empresa') {
    rules.push({ id: 'f-local-empresa', value: localEmpresa, rules: ['required'], label: 'Empresa' });
  }
  const ok = validateForm(rules);
  if (!ok) return;

  if (fim && inicio && fim < inicio) {
    fieldError('f-fim', 'Data de fim deve ser posterior à data de início.');
    return;
  }
  fieldOk('f-fim');

  // Datas retroativas só são bloqueadas na criação (edição mantém datas originais)
  if (!id && inicio) {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const di   = new Date(inicio + 'T00:00:00');
    if (di < hoje) {
      fieldError('f-inicio', 'Não é permitido criar turmas com data de início no passado.');
      return;
    }
    fieldOk('f-inicio');
  }

  if (vagas > 31) {
    fieldError('f-vagas', 'O limite máximo é 31 alunos por turma.');
    return;
  }
  fieldOk('f-vagas');

  const payload = { tenant_id: getTenantId(), codigo, curso_id, instrutor_id, data_inicio: inicio, data_fim: fim, vagas, local, status };

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    let error, newTurmaId;
    if (id) {
      ({ error } = await supabase.from('turmas').update(payload).eq('id', id).eq('tenant_id', getTenantId()));
    } else {
      payload.ocupadas = 0;
      let res = await supabase.from('turmas').insert(payload).select('id').single();
      error = res.error;
      newTurmaId = res.data?.id;

      // Retry em colisão de código
      if (error && error.code === '23505') {
        const novoCodigo = await gerarCodigoTurma(curso_id, inicio);
        payload.codigo = novoCodigo;
        res = await supabase.from('turmas').insert(payload).select('id').single();
        error = res.error;
        newTurmaId = res.data?.id;
      }
    }

    if (error) {
      if (error.code === '23505') throw new Error('Já existe uma turma com este código. Tente novamente.');
      throw error;
    }
    closeModal();
    toast(id ? 'Turma atualizada com sucesso!' : `Turma ${payload.codigo} criada!`, 'success');

    // ── Auto-enroll: vincula alunos aguardando este curso ─────────────────
    if (!id && newTurmaId) {
      autoEnrollAguardando(newTurmaId, curso_id, vagas).then(enrolled => {
        if (enrolled > 0) {
          toast(
            `${enrolled} aluno(s) em espera foram automaticamente adicionados à turma ${payload.codigo}!`,
            'info'
          );
          loadTurmas();
        }
      });
    }

    await loadTurmas();
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = id ? 'Salvar Alterações' : 'Criar Turma';
  }
}

// ─── Diário de Classe ─────────────────────────────────────────────────────────
async function verAlunos(turma) {
  const STATUS_BADGE = {
    matriculado:         'badge-blue',
    aguardando_turma:    'badge-amber',
    em_andamento:        'badge-accent',
    concluido:           'badge-green',
    certificado_emitido: 'badge-purple',
    reprovado:           'badge-red',
    cancelado:           'badge-gray',
  };
  const STATUS_LABEL = {
    matriculado:         'Matriculado',
    aguardando_turma:    'Ag. Turma',
    em_andamento:        'Em Andamento',
    concluido:           'Concluído',
    certificado_emitido: 'Cert. Emitido',
    reprovado:           'Reprovado',
    cancelado:           'Cancelado',
  };

  openModal(`Diário de Classe — ${esc(turma.codigo)}`, `
    <div style="text-align:center;padding:40px;color:var(--text-tertiary)">Carregando...</div>
  `);

  try {
    const { data, error } = await supabase
      .from('matriculas')
      .select('id, aluno_id, curso_id, aluno:aluno_id(nome, cpf, rnm), status')
      .eq('turma_id', turma.id)
      .eq('tenant_id', getTenantId())
      .neq('status', 'cancelado');

    if (error) throw error;

    if (!data?.length) {
      document.getElementById('modal-body').innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--text-tertiary)">Nenhum aluno nesta turma.</div>
      `;
      return;
    }

    // Botões de avaliação só disponíveis para turmas em andamento
    const podeAvaliar = ['agendada', 'em_andamento', 'concluida'].includes(turma.status);

    const counts = {
      em_andamento: data.filter(m => m.status === 'em_andamento').length,
      concluido:    data.filter(m => m.status === 'concluido').length,
      reprovado:    data.filter(m => m.status === 'reprovado').length,
    };

    const html = data.map(m => {
      const badge = STATUS_BADGE[m.status] ?? 'badge-gray';
      const label = STATUS_LABEL[m.status] ?? m.status;
      const doc   = m.aluno?.cpf ? `CPF: ${esc(m.aluno.cpf)}` : m.aluno?.rnm ? `RNM: ${esc(m.aluno.rnm)}` : '—';

      const btns = `
        <div style="display:flex;gap:4px;margin-top:8px">
          ${podeAvaliar && m.status === 'em_andamento' ? `
            <button class="action-btn diario-aprovar"
              style="background:var(--green-soft);color:var(--green);border-color:var(--green)"
              data-id="${m.id}" data-nome="${esc(m.aluno?.nome)}"
              data-aluno-id="${m.aluno_id}" data-curso-id="${m.curso_id}">
              ✓ Aprovar
            </button>
            <button class="action-btn danger diario-reprovar"
              data-id="${m.id}" data-nome="${esc(m.aluno?.nome)}"
              data-aluno-id="${m.aluno_id}" data-curso-id="${m.curso_id}">
              ✗ Reprovar
            </button>
          ` : ''}
          <button class="action-btn danger diario-excluir"
            data-id="${m.id}" data-nome="${esc(m.aluno?.nome ?? '')}">
            Excluir da Turma
          </button>
        </div>`;

      return `
        <div style="padding:12px 16px;border-bottom:1px solid var(--border-subtle)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-weight:500;font-size:13px">${esc(m.aluno?.nome ?? '—')}</div>
              <div style="font-size:11.5px;color:var(--text-tertiary);margin-top:2px">${doc}</div>
            </div>
            <span class="badge ${badge}">${label}</span>
          </div>
          ${btns}
        </div>`;
    }).join('');

    document.getElementById('modal-body').innerHTML = `
      <div style="display:flex;gap:16px;padding:12px 16px;background:var(--bg-elevated);border-bottom:1px solid var(--border-subtle);font-family:var(--font-mono);font-size:11.5px;color:var(--text-secondary)">
        <span>${data.length} aluno(s)</span>
        <span style="color:var(--accent)">${counts.em_andamento} em andamento</span>
        <span style="color:var(--green)">${counts.concluido} aprovados</span>
        <span style="color:var(--red)">${counts.reprovado} reprovados</span>
      </div>
      ${podeAvaliar ? `<div style="padding:8px 16px;background:var(--accent-soft);font-size:11.5px;color:var(--accent);font-family:var(--font-mono)">
        Avalie cada aluno: Aprovar avança para Concluído · Reprovar cria nova matrícula em espera
      </div>` : ''}
      <div style="max-height:420px;overflow-y:auto">${html}</div>
    `;

    // ── Bind: Aprovar ───────────────────────────────────────────────────────
    document.querySelectorAll('.diario-aprovar').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '...';
        await avaliarAluno(btn.dataset.id, 'concluido');
        toast(`${btn.dataset.nome} aprovado(a)!`, 'success');
        verAlunos(turma);
      });
    });

    // ── Bind: Reprovar ──────────────────────────────────────────────────────
    document.querySelectorAll('.diario-reprovar').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = '...';
        await avaliarAluno(btn.dataset.id, 'reprovado', {
          alunoId:  btn.dataset.alunoId,
          cursoId:  btn.dataset.cursoId,
        });
        toast(`${btn.dataset.nome} reprovado(a). Nova matrícula criada na fila de espera.`, 'info');
        verAlunos(turma);
      });
    });

    // ── Bind: Excluir da Turma ──────────────────────────────────────────────
    document.querySelectorAll('.diario-excluir').forEach(btn => {
      btn.addEventListener('click', () => removerAlunoTurma(btn.dataset.id, btn.dataset.nome, turma));
    });

  } catch (e) {
    document.getElementById('modal-body').innerHTML = `
      <div style="padding:20px;color:var(--red)">Erro ao carregar alunos da turma.</div>
    `;
  }
}

// ─── Remover aluno da turma ───────────────────────────────────────────────────
function removerAlunoTurma(matriculaId, nome, turma) {
  openModal('Excluir Aluno da Turma', `
    <div class="danger-banner">
      <div class="danger-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </div>
      <div class="danger-banner-info">
        <div class="danger-banner-title">Excluir aluno permanentemente da turma</div>
        <div class="danger-banner-sub">${esc(nome)} · Turma ${esc(turma.codigo)}</div>
      </div>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin:16px 0;line-height:1.6">
      A matrícula e os pagamentos vinculados serão excluídos. A vaga será liberada automaticamente.
    </p>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-danger" id="btn-confirmar-remover-aluno">Excluir da Turma</button>
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', () => {
    closeModal();
    verAlunos(turma);
  });

  document.getElementById('btn-confirmar-remover-aluno')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-confirmar-remover-aluno');
    btn.disabled = true; btn.textContent = 'Excluindo...';
    try {
      const tid = getTenantId();
      // Remove pagamentos da matrícula antes
      await supabase.from('pagamentos').delete().eq('matricula_id', matriculaId).eq('tenant_id', tid);
      // Remove a matrícula (trigger decrementa turma.ocupadas)
      const { error } = await supabase.from('matriculas').delete().eq('id', matriculaId).eq('tenant_id', tid);
      if (error) throw error;
      toast(`${esc(nome)} removido(a) da turma.`, 'success');
      await loadTurmas();
      verAlunos(turma);
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
      btn.disabled = false; btn.textContent = 'Excluir da Turma';
    }
  });
}

// ─── Avaliação de aluno (aprovar / reprovar) ──────────────────────────────────
async function avaliarAluno(matriculaId, novoStatus, opts = {}) {
  const { error } = await supabase
    .from('matriculas')
    .update({ status: novoStatus })
    .eq('id', matriculaId)
    .eq('tenant_id', getTenantId())
    .in('status', ['matriculado', 'em_andamento']);

  if (error) throw error;

  // Reprovado: cria nova matrícula automática em aguardando_turma (reciclagem)
  if (novoStatus === 'reprovado' && opts.alunoId && opts.cursoId) {
    await supabase.from('matriculas').insert({
      tenant_id: getTenantId(),
      aluno_id:  opts.alunoId,
      curso_id:  opts.cursoId,
      status:    'aguardando_turma',
    }).catch(() => {}); // Ignora erro silenciosamente (pode já ter outra ativa)
  }
}

// ─── Encerrar Turma ───────────────────────────────────────────────────────────
async function encerrarTurma(turma) {
  openModal(`Encerrar Turma — ${esc(turma.codigo)}`, `
    <div style="padding:40px;text-align:center;color:var(--text-tertiary)">Carregando alunos...</div>
  `);

  try {
    const { data, error } = await supabase
      .from('matriculas')
      .select('id, aluno_id, curso_id, status, aluno:aluno_id(nome, cpf, rnm)')
      .eq('turma_id', turma.id)
      .eq('tenant_id', getTenantId())
      .neq('status', 'cancelado')
      .order('status');

    if (error) throw error;
    _renderEncerrarModal(turma, data || []);
  } catch (e) {
    document.getElementById('modal-body').innerHTML =
      `<div style="padding:20px;color:var(--red)">Erro ao carregar alunos da turma.</div>`;
  }
}

function _renderEncerrarModal(turma, data) {
  const PENDENTES  = ['em_andamento', 'matriculado'];
  const pendentes  = data.filter(m => PENDENTES.includes(m.status));
  const avaliados  = data.filter(m => !PENDENTES.includes(m.status));
  const todosAvaliados = pendentes.length === 0;

  const STATUS_BADGE = { concluido:'badge-green', reprovado:'badge-red', certificado_emitido:'badge-purple', em_andamento:'badge-accent', matriculado:'badge-blue' };
  const STATUS_LABEL = { concluido:'Aprovado', reprovado:'Reprovado', certificado_emitido:'Certificado', em_andamento:'Em Andamento', matriculado:'Matriculado' };

  const counts = {
    aprovados:   data.filter(m => m.status === 'concluido' || m.status === 'certificado_emitido').length,
    reprovados:  data.filter(m => m.status === 'reprovado').length,
    pendentes:   pendentes.length,
  };

  const renderRow = (m, avaliado) => {
    const doc = m.aluno?.cpf ? m.aluno.cpf : (m.aluno?.rnm ? m.aluno.rnm : '');
    return `
      <div class="enc-row" data-id="${m.id}" data-aluno-id="${m.aluno_id}" data-curso-id="${m.curso_id}"
           data-nome="${esc(m.aluno?.nome ?? '')}"
           style="padding:11px 16px;border-bottom:1px solid var(--border-subtle);
                  display:flex;align-items:center;gap:12px">
        ${!avaliado ? `
          <input type="checkbox" class="enc-check" data-id="${m.id}"
            style="width:15px;height:15px;cursor:pointer;accent-color:var(--accent);flex-shrink:0">
        ` : `<div style="width:15px;flex-shrink:0"></div>`}
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;font-size:13px">${esc(m.aluno?.nome ?? '—')}</div>
          ${doc ? `<div style="font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono)">${esc(doc)}</div>` : ''}
        </div>
        <span class="badge ${STATUS_BADGE[m.status] ?? 'badge-gray'}" style="flex-shrink:0">
          ${STATUS_LABEL[m.status] ?? m.status}
        </span>
        ${!avaliado ? `
          <div style="display:flex;gap:4px;flex-shrink:0">
            <button class="action-btn enc-aprovar"
              style="color:var(--green);border-color:var(--green);padding:3px 8px"
              data-id="${m.id}" data-nome="${esc(m.aluno?.nome ?? '')}"
              data-aluno-id="${m.aluno_id}" data-curso-id="${m.curso_id}">✓</button>
            <button class="action-btn danger enc-reprovar"
              style="padding:3px 8px"
              data-id="${m.id}" data-nome="${esc(m.aluno?.nome ?? '')}"
              data-aluno-id="${m.aluno_id}" data-curso-id="${m.curso_id}">✗</button>
          </div>
        ` : ''}
      </div>`;
  };

  document.getElementById('modal-body').innerHTML = `

    <!-- Resumo -->
    <div style="display:flex;gap:0;border-bottom:1px solid var(--border-subtle)">
      <div style="flex:1;padding:10px 16px;text-align:center;border-right:1px solid var(--border-subtle)">
        <div style="font-size:18px;font-weight:700;color:var(--amber)">${counts.pendentes}</div>
        <div style="font-size:10.5px;color:var(--text-tertiary)">Pendentes</div>
      </div>
      <div style="flex:1;padding:10px 16px;text-align:center;border-right:1px solid var(--border-subtle)">
        <div style="font-size:18px;font-weight:700;color:var(--green)">${counts.aprovados}</div>
        <div style="font-size:10.5px;color:var(--text-tertiary)">Aprovados</div>
      </div>
      <div style="flex:1;padding:10px 16px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:var(--red)">${counts.reprovados}</div>
        <div style="font-size:10.5px;color:var(--text-tertiary)">Reprovados</div>
      </div>
    </div>

    <!-- Barra de ações em massa (só se houver pendentes) -->
    ${pendentes.length > 0 ? `
    <div style="padding:10px 16px;background:var(--bg-elevated);border-bottom:1px solid var(--border-subtle);
                display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12.5px;color:var(--text-secondary)">
        <input type="checkbox" id="enc-select-all" style="width:14px;height:14px;accent-color:var(--accent)">
        Selecionar todos
      </label>
      <div style="flex:1"></div>
      <button class="action-btn" id="enc-massa-aprovar"
        style="color:var(--green);border-color:var(--green);display:flex;align-items:center;gap:4px;opacity:.5"
        disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><polyline points="20 6 9 17 4 12"/></svg>
        Aprovar selecionados
      </button>
      <button class="action-btn danger" id="enc-massa-reprovar"
        style="display:flex;align-items:center;gap:4px;opacity:.5"
        disabled>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Reprovar selecionados
      </button>
    </div>
    ` : ''}

    <!-- Lista -->
    <div style="max-height:360px;overflow-y:auto">
      ${pendentes.length > 0 ? `
        <div style="padding:6px 16px;font-size:10.5px;font-weight:600;text-transform:uppercase;
                    letter-spacing:.06em;color:var(--amber);background:color-mix(in srgb,var(--amber) 8%,transparent)">
          Pendentes de avaliação (${pendentes.length})
        </div>
        ${pendentes.map(m => renderRow(m, false)).join('')}
      ` : ''}
      ${avaliados.length > 0 ? `
        <div style="padding:6px 16px;font-size:10.5px;font-weight:600;text-transform:uppercase;
                    letter-spacing:.06em;color:var(--text-tertiary);background:var(--bg-elevated)">
          Já avaliados (${avaliados.length})
        </div>
        ${avaliados.map(m => renderRow(m, true)).join('')}
      ` : ''}
      ${data.length === 0 ? `
        <div style="padding:40px;text-align:center;color:var(--text-tertiary);font-size:13px">
          Nenhum aluno nesta turma.
        </div>` : ''}
    </div>

    <!-- Footer -->
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="btn-encerrar-confirm"
        ${!todosAvaliados ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>
        ${todosAvaliados ? 'Encerrar Turma' : `Avalie os ${counts.pendentes} aluno(s) pendentes`}
      </button>
    </div>
  `;

  // ── Listeners ──────────────────────────────────────────────────────────────
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);

  // Selecionar todos
  document.getElementById('enc-select-all')?.addEventListener('change', function () {
    document.querySelectorAll('.enc-check').forEach(cb => cb.checked = this.checked);
    _atualizarBotoesEmMassa();
  });

  document.querySelectorAll('.enc-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const total    = document.querySelectorAll('.enc-check').length;
      const checked  = document.querySelectorAll('.enc-check:checked').length;
      const selectAll = document.getElementById('enc-select-all');
      if (selectAll) selectAll.checked = checked === total;
      _atualizarBotoesEmMassa();
    });
  });

  // Ação individual — Aprovar
  document.querySelectorAll('.enc-aprovar').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '...';
      try {
        await avaliarAluno(btn.dataset.id, 'concluido');
        toast(`${btn.dataset.nome} aprovado(a)!`, 'success');
      } catch { toast('Erro ao aprovar.', 'error'); }
      const { data: fresh } = await supabase
        .from('matriculas').select('id, aluno_id, curso_id, status, aluno:aluno_id(nome, cpf, rnm)')
        .eq('turma_id', turma.id).eq('tenant_id', getTenantId()).neq('status', 'cancelado').order('status');
      _renderEncerrarModal(turma, fresh || []);
    });
  });

  // Ação individual — Reprovar
  document.querySelectorAll('.enc-reprovar').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = '...';
      try {
        await avaliarAluno(btn.dataset.id, 'reprovado', { alunoId: btn.dataset.alunoId, cursoId: btn.dataset.cursoId });
        toast(`${btn.dataset.nome} reprovado(a). Nova matrícula em espera criada.`, 'info');
      } catch { toast('Erro ao reprovar.', 'error'); }
      const { data: fresh } = await supabase
        .from('matriculas').select('id, aluno_id, curso_id, status, aluno:aluno_id(nome, cpf, rnm)')
        .eq('turma_id', turma.id).eq('tenant_id', getTenantId()).neq('status', 'cancelado').order('status');
      _renderEncerrarModal(turma, fresh || []);
    });
  });

  // Ação em massa — Aprovar
  document.getElementById('enc-massa-aprovar')?.addEventListener('click', async () => {
    const ids = _getSelectedIds();
    if (!ids.length) return;
    const btn = document.getElementById('enc-massa-aprovar');
    btn.disabled = true; btn.textContent = 'Aprovando...';
    for (const id of ids) {
      try { await avaliarAluno(id, 'concluido'); } catch { /* continua */ }
    }
    toast(`${ids.length} aluno(s) aprovado(s)!`, 'success');
    const { data: fresh } = await supabase
      .from('matriculas').select('id, aluno_id, curso_id, status, aluno:aluno_id(nome, cpf, rnm)')
      .eq('turma_id', turma.id).eq('tenant_id', getTenantId()).neq('status', 'cancelado').order('status');
    _renderEncerrarModal(turma, fresh || []);
  });

  // Ação em massa — Reprovar
  document.getElementById('enc-massa-reprovar')?.addEventListener('click', async () => {
    const rows = document.querySelectorAll('.enc-check:checked');
    if (!rows.length) return;
    const btn = document.getElementById('enc-massa-reprovar');
    btn.disabled = true; btn.textContent = 'Reprovando...';
    for (const cb of rows) {
      const row = cb.closest('.enc-row');
      try {
        await avaliarAluno(cb.dataset.id, 'reprovado', {
          alunoId: row?.dataset.alunoId, cursoId: row?.dataset.cursoId,
        });
      } catch { /* continua */ }
    }
    toast(`${rows.length} aluno(s) reprovado(s). Matrículas em espera criadas.`, 'info');
    const { data: fresh } = await supabase
      .from('matriculas').select('id, aluno_id, curso_id, status, aluno:aluno_id(nome, cpf, rnm)')
      .eq('turma_id', turma.id).eq('tenant_id', getTenantId()).neq('status', 'cancelado').order('status');
    _renderEncerrarModal(turma, fresh || []);
  });

  // Encerrar turma
  document.getElementById('btn-encerrar-confirm')?.addEventListener('click', async () => {
    if (!todosAvaliados) return;
    const btn = document.getElementById('btn-encerrar-confirm');
    btn.disabled = true; btn.textContent = 'Encerrando...';
    const { error } = await supabase.from('turmas')
      .update({ status: 'concluida' }).eq('id', turma.id).eq('tenant_id', getTenantId());
    if (error) { toast('Erro ao encerrar turma.', 'error'); btn.disabled = false; btn.textContent = 'Encerrar Turma'; return; }
    closeModal();
    toast(`Turma ${esc(turma.codigo)} encerrada!`, 'success');
    autoEmitirCertificados().then(n => { if (n > 0) toast(`${n} certificado(s) emitido(s) automaticamente.`, 'info'); });
    await loadTurmas();
  });
}

function _getSelectedIds() {
  return [...document.querySelectorAll('.enc-check:checked')].map(cb => cb.dataset.id);
}

function _atualizarBotoesEmMassa() {
  const temSelecionados = document.querySelectorAll('.enc-check:checked').length > 0;
  const btnApr = document.getElementById('enc-massa-aprovar');
  const btnRep = document.getElementById('enc-massa-reprovar');
  if (btnApr) { btnApr.disabled = !temSelecionados; btnApr.style.opacity = temSelecionados ? '1' : '.5'; }
  if (btnRep) { btnRep.disabled = !temSelecionados; btnRep.style.opacity = temSelecionados ? '1' : '.5'; }
}

// ─── Exportação ───────────────────────────────────────────────────────────────
function exportarCSV() {
  const headers = ['Código','Curso','Instrutor','Início','Fim','Vagas','Ocupadas','Status'];
  const rows = _turmas.map(t => [
    t.codigo, t.curso_nome, t.instrutor_nome, t.data_inicio, t.data_fim, t.vagas, t.ocupadas, t.status
  ].map(v => `"${v||''}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'turmas.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado com sucesso!', 'success');
}

async function exportarPDF() {
  try {
    toast('Gerando PDF...', 'info');
    if (typeof window.jspdf === 'undefined') {
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = resolve;
        document.head.appendChild(script);
      });
      await new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js';
        script.onload = resolve;
        document.head.appendChild(script);
      });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text('Relatório de Turmas', 14, 15);
    const body = _turmas.map(t => [
      t.codigo,
      t.curso_nome,
      t.instrutor_nome,
      `${t.data_inicio ? fmtDate(t.data_inicio) : ''} a ${t.data_fim ? fmtDate(t.data_fim) : '-'}`,
      `${t.ocupadas || 0}/${t.vagas}`,
      LABEL[t.status] || t.status
    ]);
    doc.autoTable({
      head: [['Código', 'Curso', 'Instrutor', 'Período', 'Vagas', 'Status']],
      body: body,
      startY: 20,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] }
    });
    doc.save('turmas.pdf');
    toast('PDF exportado com sucesso!', 'success');
  } catch (err) {
    console.error(err);
    toast('Erro ao gerar PDF', 'error');
  }
}

// ─── Exclusão de Turmas ────────────────────────────────────────────────────────

function confirmarExclusaoTurma(turma) {
  openModal('Excluir Turma', `
    <div class="danger-banner">
      <div class="danger-banner-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </div>
      <div class="danger-banner-info">
        <div class="danger-banner-title">Excluir turma permanentemente</div>
        <div class="danger-banner-sub">${turma.codigo} · ${turma.curso_nome}</div>
      </div>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;line-height:1.6">
      Esta ação é <strong style="color:var(--red)">irreversível</strong>. Todas as matrículas e pagamentos vinculados a esta turma serão excluídos permanentemente junto com ela.
    </p>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-danger" id="btn-confirmar-exclusao-turma">Excluir Turma</button>
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('btn-confirmar-exclusao-turma')?.addEventListener('click', () => excluirTurma(turma.id));
}

async function excluirTurma(id) {
  const btn = document.getElementById('btn-confirmar-exclusao-turma');
  btn.disabled = true;
  btn.textContent = 'Excluindo...';
  try {
    const tid = getTenantId();

    // 1. Busca IDs das matrículas vinculadas
    const { data: mats } = await supabase
      .from('matriculas').select('id').eq('turma_id', id).eq('tenant_id', tid);

    // 2. Apaga pagamentos dessas matrículas
    if (mats?.length) {
      const matIds = mats.map(m => m.id);
      await supabase.from('pagamentos').delete().in('matricula_id', matIds).eq('tenant_id', tid);
    }

    // 3. Apaga as matrículas
    await supabase.from('matriculas').delete().eq('turma_id', id).eq('tenant_id', tid);

    // 4. Apaga a turma
    const { error } = await supabase.from('turmas').delete().eq('id', id).eq('tenant_id', tid);
    if (error) throw error;

    closeModal();
    toast('Turma e matrículas excluídas com sucesso!', 'success');
    await loadTurmas();
  } catch (err) {
    console.error(err);
    toast(`Erro ao excluir: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Excluir Turma';
  }
}

