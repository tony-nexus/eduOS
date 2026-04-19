/**
 * /js/views/matriculas.js
 * CRUD real para Matrículas.
 *
 * CORREÇÕES APLICADAS:
 *  - Corrigido campo 'inicio' → 'data_inicio' na query de turmas (Bug #3)
 *  - Filtro de turmas por curso no modal (só exibe turmas do curso selecionado)
 *  - XSS escape em interpolações HTML
 *  - Validação de aluno duplicado na mesma turma (guard client-side)
 *  - [FIX CRÍTICO] Incremento/decremento real de turmas.ocupadas ao matricular/cancelar
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast, fmtDate, esc } from '../ui/components.js';
import { datasConflitam } from '../core/automations.js';

let _matriculas      = [];
let _alunos          = [];
let _cursos          = [];
let _turmas          = [];
let _selectedAlunos  = [];
let _selectedTurmaId = null;

const BADGE_MAP = { matriculado:'badge-blue', aguardando_turma:'badge-amber', em_andamento:'badge-accent', concluido:'badge-green', certificado_emitido:'badge-purple', cancelado:'badge-red', reprovado:'badge-red' };
const LABEL_MAP = { matriculado:'Matriculado', aguardando_turma:'Ag. Turma', em_andamento:'Em Andamento', concluido:'Concluído', certificado_emitido:'Cert. Emitido', cancelado:'Cancelado', reprovado:'Reprovado' };

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Matrículas</h1><p>Registro e gestão de matrículas</p></div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-nova-mat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nova Matrícula
        </button>
      </div>
    </div>
    <div class="stats-row" id="mats-kpis">
      ${Array(4).fill('<div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>').join('')}
    </div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-mats" placeholder="Aluno ou turma...">
        </div>
        <select class="select-input" id="filtro-status-mat">
          <option value="">Todos os status</option>
          <option value="matriculado">Matriculado</option>
          <option value="aguardando_turma">Aguardando Turma</option>
          <option value="em_andamento">Em Andamento</option>
          <option value="concluido">Concluído</option>
          <option value="certificado_emitido">Certificado Emitido</option>
          <option value="cancelado">Cancelado</option>
          <option value="reprovado">Reprovado</option>
        </select>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>Aluno</th><th>Curso</th><th>Turma</th>
            <th>Data Matrícula</th><th>Status</th><th>Ações</th>
          </tr></thead>
          <tbody id="mats-tbody">
            <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-tertiary)">
              Carregando...
            </td></tr>
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        <span class="table-info" id="mats-count">—</span>
      </div>
    </div>
  `);

  document.getElementById('btn-nova-mat')?.addEventListener('click', () => modalNovaMatricula());
  document.getElementById('search-mats')?.addEventListener('input', applyFilter);
  document.getElementById('filtro-status-mat')?.addEventListener('change', applyFilter);

  await Promise.all([loadMatriculas(), loadAux()]);
}

// ─── Fetches ──────────────────────────────────────────────────────────────────
async function loadAux() {
  try {
    const [r1, r2, r3] = await Promise.all([
      supabase.from('alunos').select('id, nome, cpf, rnm, cnh_num').eq('tenant_id', getTenantId()).eq('status', 'ativo').order('nome'),
      supabase.from('cursos').select('id, nome, valor_padrao').eq('tenant_id', getTenantId()).eq('ativo', true).order('nome'),
      // Apenas turmas agendadas aceitam novas matrículas — inclui datas para verificação de conflito
      supabase.from('turmas').select('id, codigo, curso_id, vagas, ocupadas, status, data_inicio, data_fim, instrutor:instrutor_id(nome)')
        .eq('tenant_id', getTenantId())
        .eq('status', 'agendada')
        .order('data_inicio', { ascending: true }),
    ]);
    _alunos = r1.data || [];
    _cursos = r2.data || [];
    _turmas = r3.data || [];
  } catch (err) {
    console.error('[Matrículas] loadAux:', err);
  }
}

async function loadMatriculas() {
  try {
    const { data, error } = await supabase
      .from('matriculas')
      .select('*, aluno:aluno_id(nome), curso:curso_id(nome), turma:turma_id(codigo)')
      .eq('tenant_id', getTenantId())
      .order('created_at', { ascending: false });

    if (error) throw error;
    _matriculas = (data || []).map(m => ({
      ...m,
      aluno_nome:   m.aluno?.nome   || '—',
      curso_nome:   m.curso?.nome   || '—',
      turma_codigo: m.turma?.codigo || '—',
    }));
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar matrículas', 'error');
    _matriculas = [];
  }
  renderKPIs(_matriculas);
  applyFilter();
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function renderKPIs(mats) {
  const em  = mats.filter(m => m.status === 'em_andamento').length;
  const con = mats.filter(m => m.status === 'concluido' || m.status === 'certificado_emitido').length;
  const ag  = mats.filter(m => m.status === 'aguardando_turma').length;
  const el  = document.getElementById('mats-kpis');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value" style="color:var(--text-primary)">${mats.length}</div></div>
    <div class="stat-card"><div class="stat-label">Em Andamento</div><div class="stat-value" style="color:var(--accent)">${em}</div></div>
    <div class="stat-card"><div class="stat-label">Concluídas</div><div class="stat-value" style="color:var(--green)">${con}</div></div>
    <div class="stat-card"><div class="stat-label">Ag. Turma</div><div class="stat-value" style="color:var(--amber)">${ag}</div></div>
  `;
}

// ─── Filtro ───────────────────────────────────────────────────────────────────
function applyFilter() {
  const q  = (document.getElementById('search-mats')?.value || '').toLowerCase();
  const st = document.getElementById('filtro-status-mat')?.value || '';
  const f  = _matriculas.filter(m =>
    (!q  || m.aluno_nome.toLowerCase().includes(q) || m.turma_codigo.toLowerCase().includes(q) || m.curso_nome.toLowerCase().includes(q)) &&
    (!st || m.status === st)
  );
  const tbody = document.getElementById('mats-tbody');
  const count = document.getElementById('mats-count');
  if (!tbody) return;

  if (!f.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-tertiary)">Nenhuma matrícula encontrada.</td></tr>`;
    if (count) count.textContent = '0 registros';
    return;
  }

  tbody.innerHTML = f.map(m => `
    <tr>
      <td style="font-weight:500">${esc(m.aluno_nome)}</td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${esc(m.curso_nome)}</td>
      <td><span style="font-family:var(--font-mono);font-size:12px;color:var(--text-tertiary)">${esc(m.turma_codigo)}</span></td>
      <td style="font-size:12px;color:var(--text-tertiary)">${fmtDate(m.created_at)}</td>
      <td><span class="badge ${BADGE_MAP[m.status] ?? 'badge-gray'}">${LABEL_MAP[m.status] ?? m.status}</span></td>
      <td>
        <button class="action-btn danger action-excluir" data-id="${m.id}" title="Excluir matrícula">Excluir</button>
      </td>
    </tr>
  `).join('');

  if (count) count.textContent = `${f.length} registro${f.length !== 1 ? 's' : ''}`;

  document.querySelectorAll('.action-excluir').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = _matriculas.find(x => x.id === btn.dataset.id);
      if (m) modalExcluirMatricula(m);
    });
  });
}

// ─── Modal Nova Matrícula ─────────────────────────────────────────────────────
function modalNovaMatricula() {
  _selectedAlunos = [];

  const curOpts = _cursos.map(c =>
    `<option value="${c.id}">${esc(c.nome)}</option>`
  ).join('');

  openModal('Nova Matrícula', `
    <div class="form-grid">

      <div class="form-group full">
        <label>Aluno(s) <span aria-hidden="true" style="color:var(--red)">*</span></label>
        <div id="aluno-picker"
          style="border:1px solid var(--border-default);border-radius:8px;background:var(--bg-input-solid);padding:6px 10px;min-height:42px;cursor:text"
          onclick="document.getElementById('aluno-search-input').focus()">
          <div id="aluno-tags" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:2px"></div>
          <input id="aluno-search-input" type="text" autocomplete="off" spellcheck="false"
            placeholder="Buscar por nome, CPF, CNH ou RNM..."
            style="border:none;background:transparent;outline:none;width:100%;min-width:140px;font-size:13px;color:var(--text-primary);padding:4px 0">
        </div>
        <div style="position:relative">
          <div id="aluno-results" hidden
            style="position:absolute;top:2px;left:0;right:0;background:var(--bg-input-solid);border:1px solid var(--border-default);border-radius:8px;box-shadow:var(--shadow-lg);z-index:300;max-height:220px;overflow-y:auto">
          </div>
        </div>
        <small style="color:var(--text-tertiary);font-size:11px">Selecione múltiplos alunos para matrícula em massa.</small>
      </div>

      <div class="form-group full">
        <label>Curso <span aria-hidden="true" style="color:var(--red)">*</span></label>
        <select id="f-curso">
          <option value="">— Selecionar curso —</option>
          ${curOpts}
        </select>
      </div>

      <div class="form-group full">
        <label>Turma <span style="font-size:11px;color:var(--text-tertiary);font-weight:400">(opcional)</span></label>
        <div id="turma-picker" tabindex="0"
          style="border:1px solid var(--border-default);border-radius:8px;background:var(--bg-input-solid);
                 padding:8px 12px;min-height:42px;cursor:pointer;display:flex;align-items:center;
                 justify-content:space-between;gap:8px;user-select:none">
          <span id="turma-picker-label" style="font-size:13px;color:var(--text-tertiary)">— Selecione um curso primeiro —</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"
               style="flex-shrink:0;color:var(--text-tertiary)"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div style="position:relative">
          <div id="turma-dropdown" hidden
            style="position:absolute;top:2px;left:0;right:0;background:var(--bg-input-solid);
                   border:1px solid var(--border-default);border-radius:8px;
                   box-shadow:var(--shadow-lg);z-index:300;max-height:300px;overflow-y:auto">
          </div>
        </div>
        <small style="color:var(--text-tertiary);font-size:11px">
          Turmas abertas do curso selecionado. Sem turma → status <strong>Aguardando Turma</strong>.
        </small>
      </div>

      <div class="form-group full">
        <label>Observações</label>
        <textarea id="f-obs" placeholder="Informações adicionais..."></textarea>
      </div>

    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
        Salvar Matrícula
      </button>
    </div>
  `);

  _selectedTurmaId = null;
  bindSearchAluno();
  bindTurmaPicker([]);

  document.getElementById('f-curso')?.addEventListener('change', function() {
    const filtradas = _turmas.filter(t => t.curso_id === this.value);
    _selectedTurmaId = null;
    _setTurmaLabel(null);
    renderTurmaOpcoes(filtradas);
  });

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => saveMatricula());
}

// ─── Search de alunos com multi-seleção e navegação por teclado ──────────────
function bindSearchAluno() {
  const input   = document.getElementById('aluno-search-input');
  const results = document.getElementById('aluno-results');
  const tagsEl  = document.getElementById('aluno-tags');
  if (!input) return;

  let highlightIdx = -1;

  function renderTags() {
    tagsEl.innerHTML = _selectedAlunos.map(a => `
      <span style="display:inline-flex;align-items:center;gap:4px;background:var(--accent-soft);color:var(--accent);border:1px solid var(--border-default);border-radius:20px;padding:2px 8px 2px 10px;font-size:12px;font-weight:500;white-space:nowrap">
        ${esc(a.nome)}
        <button type="button" data-id="${a.id}"
          style="background:none;border:none;cursor:pointer;color:var(--accent);padding:0 0 0 2px;font-size:16px;line-height:1"
          aria-label="Remover ${esc(a.nome)}">×</button>
      </span>
    `).join('');
    tagsEl.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        _selectedAlunos = _selectedAlunos.filter(a => a.id !== btn.dataset.id);
        renderTags();
      });
    });
  }

  function setHighlight(rows, idx) {
    rows.forEach((r, i) => {
      r.style.background = i === idx ? 'var(--bg-elevated)' : '';
    });
  }

  function showResults(query) {
    highlightIdx = -1;
    const q       = (query || '').trim();
    const qLower  = q.toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    const filtered = _alunos
      .filter(a => {
        if (_selectedAlunos.some(s => s.id === a.id)) return false;
        if (!q) return true;
        if (a.nome.toLowerCase().includes(qLower)) return true;
        if (qDigits && (a.cpf     || '').replace(/\D/g, '').includes(qDigits)) return true;
        if (qDigits && (a.cnh_num || '').includes(qDigits)) return true;
        if ((a.rnm   || '').toLowerCase().includes(qLower)) return true;
        return false;
      })
      .slice(0, 12);

    if (!filtered.length) {
      results.innerHTML = `<div style="padding:12px 14px;font-size:13px;color:var(--text-tertiary)">Nenhum aluno encontrado.</div>`;
      results.hidden = false;
      return;
    }

    results.innerHTML = filtered.map(a => {
      const docs = [];
      if (a.cpf)     docs.push(`<span class="badge badge-blue"   style="font-size:9px">CPF</span> ${esc(a.cpf)}`);
      if (a.rnm)     docs.push(`<span class="badge badge-purple" style="font-size:9px">RNM</span> ${esc(a.rnm)}`);
      if (a.cnh_num) docs.push(`<span class="badge badge-amber"  style="font-size:9px">CNH</span> ${esc(a.cnh_num)}`);
      return `
        <div class="aluno-result-row" data-id="${a.id}"
          style="padding:8px 14px;cursor:pointer;border-bottom:1px solid var(--border-subtle)">
          <div style="font-size:13px;font-weight:500;color:var(--text-primary)">${esc(a.nome)}</div>
          ${docs.length ? `<div style="font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono);display:flex;gap:10px;flex-wrap:wrap;margin-top:2px">${docs.join('')}</div>` : ''}
        </div>`;
    }).join('');

    results.querySelectorAll('.aluno-result-row').forEach(row => {
      const allRows = () => [...results.querySelectorAll('.aluno-result-row')];
      row.addEventListener('mouseenter', () => {
        highlightIdx = allRows().indexOf(row);
        setHighlight(allRows(), highlightIdx);
      });
      row.addEventListener('mouseleave', () => row.style.background = '');
      // mousedown: impede que o input perca foco ao clicar no resultado
      row.addEventListener('mousedown', e => e.preventDefault());
      row.addEventListener('click', e => {
        e.stopPropagation(); // bloqueia o outsideClick do documento
        const aluno = _alunos.find(a => a.id === row.dataset.id);
        if (aluno && !_selectedAlunos.some(s => s.id === aluno.id)) {
          _selectedAlunos.push(aluno);
          renderTags();
        }
        input.value = '';
        showResults(''); // reabre imediatamente com lista atualizada
        input.focus();
      });
    });

    results.hidden = false;
  }

  input.addEventListener('input', () => {
    if (!input.value.trim()) { results.hidden = true; return; }
    showResults(input.value);
  });

  input.addEventListener('focus', () => showResults(input.value));

  input.addEventListener('keydown', e => {
    if (results.hidden) return;
    const rows = [...results.querySelectorAll('.aluno-result-row')];
    if (!rows.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlightIdx = Math.min(highlightIdx + 1, rows.length - 1);
      setHighlight(rows, highlightIdx);
      rows[highlightIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIdx = Math.max(highlightIdx - 1, 0);
      setHighlight(rows, highlightIdx);
      rows[highlightIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = highlightIdx >= 0 ? highlightIdx : 0;
      rows[idx]?.click();
    } else if (e.key === 'Escape') {
      results.hidden = true;
      highlightIdx = -1;
    }
  });

  document.addEventListener('click', function outsideClick(e) {
    const picker = document.getElementById('aluno-picker');
    const drop   = document.getElementById('aluno-results');
    if (!picker || !drop) { document.removeEventListener('click', outsideClick); return; }
    if (!picker.contains(e.target) && !drop.contains(e.target)) {
      drop.hidden = true;
      highlightIdx = -1;
    }
  });
}

// ─── Turma Picker ─────────────────────────────────────────────────────────────
function _setTurmaLabel(turma) {
  const lbl = document.getElementById('turma-picker-label');
  if (!lbl) return;
  if (!turma) {
    lbl.textContent = '— Sem turma / Aguardando —';
    lbl.style.color = 'var(--text-tertiary)';
  } else {
    const disp = (turma.vagas || 0) - (turma.ocupadas || 0);
    lbl.innerHTML = `
      <span style="font-family:var(--font-mono);font-weight:600;color:var(--accent)">${esc(turma.codigo)}</span>
      <span style="color:var(--text-tertiary);font-size:12px;margin-left:8px">${disp} vaga${disp !== 1 ? 's' : ''} disponível${disp !== 1 ? 'is' : ''}</span>`;
    lbl.style.color = '';
  }
}

function renderTurmaOpcoes(turmas) {
  const drop = document.getElementById('turma-dropdown');
  if (!drop) return;

  const semTurma = `
    <div class="turma-result-row" data-id=""
      style="padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;gap:8px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"
           style="color:var(--text-tertiary);flex-shrink:0"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      <div>
        <div style="font-size:13px;color:var(--text-secondary);font-weight:500">Sem turma / Aguardando</div>
        <div style="font-size:11px;color:var(--text-tertiary)">Aluno entra na fila FIFO e é alocado automaticamente</div>
      </div>
    </div>`;

  if (!turmas.length) {
    drop.innerHTML = semTurma + `
      <div style="padding:14px;font-size:13px;color:var(--text-tertiary);text-align:center">
        Nenhuma turma agendada para este curso.
      </div>`;
    return;
  }

  drop.innerHTML = semTurma + turmas.map(t => {
    const disp     = (t.vagas || 0) - (t.ocupadas || 0);
    const pctOcup  = t.vagas ? Math.round((t.ocupadas || 0) / t.vagas * 100) : 0;
    const cor      = disp <= 0 ? 'var(--red)' : disp <= 2 ? 'var(--amber)' : 'var(--green)';
    const disabled = disp <= 0;

    const inicio = t.data_inicio ? fmtDate(t.data_inicio) : null;
    const fim    = t.data_fim    ? fmtDate(t.data_fim)    : null;
    const datas  = inicio ? (fim ? `${inicio} → ${fim}` : `A partir de ${inicio}`) : 'Datas não definidas';

    return `
      <div class="turma-result-row" data-id="${t.id}"
        style="padding:10px 14px;cursor:${disabled ? 'not-allowed' : 'pointer'};
               border-bottom:1px solid var(--border-subtle);
               opacity:${disabled ? '0.5' : '1'}"
        ${disabled ? 'data-disabled="true"' : ''}>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
          <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--accent)">${esc(t.codigo)}</span>
          <span style="font-size:11px;padding:2px 8px;border-radius:20px;
                       background:color-mix(in srgb,${cor} 15%,transparent);
                       color:${cor};font-weight:600;white-space:nowrap">
            ${disp > 0 ? `${disp} vaga${disp !== 1 ? 's' : ''}` : 'Sem vagas'}
          </span>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"
               style="vertical-align:middle;margin-right:3px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${esc(datas)}
        </div>
        ${t.instrutor?.nome ? `
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"
               style="vertical-align:middle;margin-right:3px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          ${esc(t.instrutor.nome)}
        </div>` : ''}
        <div style="height:3px;border-radius:2px;background:var(--border-subtle)">
          <div style="height:100%;border-radius:2px;width:${pctOcup}%;background:${cor};transition:width .3s"></div>
        </div>
        <div style="font-size:10px;color:var(--text-tertiary);margin-top:3px;text-align:right">
          ${t.ocupadas || 0}/${t.vagas || 0} ocupadas
        </div>
      </div>`;
  }).join('');
}

function bindTurmaPicker(turmasIniciais) {
  renderTurmaOpcoes(turmasIniciais);

  const picker = document.getElementById('turma-picker');
  const drop   = document.getElementById('turma-dropdown');
  if (!picker || !drop) return;

  let highlightIdx = -1;

  function open()  { drop.hidden = false; picker.style.borderColor = 'var(--accent)'; }
  function close() { drop.hidden = true;  picker.style.borderColor = ''; highlightIdx = -1; }

  function setHighlight(rows, idx) {
    rows.forEach((r, i) => r.style.background = i === idx ? 'var(--bg-elevated)' : '');
  }

  function selectRow(row) {
    if (row.dataset.disabled) return;
    const id    = row.dataset.id || null;
    _selectedTurmaId = id || null;
    _setTurmaLabel(id ? _turmas.find(t => t.id === id) : null);
    close();
    picker.style.borderColor = _selectedTurmaId ? 'var(--accent)' : '';
  }

  picker.addEventListener('click', () => drop.hidden ? open() : close());
  picker.addEventListener('keydown', e => {
    const rows = [...drop.querySelectorAll('.turma-result-row')];
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop.hidden ? open() : (rows[highlightIdx >= 0 ? highlightIdx : 0]?.click()); }
    if (e.key === 'Escape')    { close(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (drop.hidden) open(); highlightIdx = Math.min(highlightIdx + 1, rows.length - 1); setHighlight(rows, highlightIdx); rows[highlightIdx]?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); highlightIdx = Math.max(highlightIdx - 1, 0); setHighlight(rows, highlightIdx); rows[highlightIdx]?.scrollIntoView({ block: 'nearest' }); }
  });

  drop.addEventListener('mousedown', e => e.preventDefault());

  drop.addEventListener('click', e => {
    const row = e.target.closest('.turma-result-row');
    if (row) selectRow(row);
  });

  drop.addEventListener('mouseover', e => {
    const row = e.target.closest('.turma-result-row');
    if (!row) return;
    const rows = [...drop.querySelectorAll('.turma-result-row')];
    highlightIdx = rows.indexOf(row);
    setHighlight(rows, highlightIdx);
  });

  drop.addEventListener('mouseleave', () => {
    [...drop.querySelectorAll('.turma-result-row')].forEach(r => r.style.background = '');
    highlightIdx = -1;
  });

  document.addEventListener('click', function outsideClick(e) {
    const p = document.getElementById('turma-picker');
    const d = document.getElementById('turma-dropdown');
    if (!p || !d) { document.removeEventListener('click', outsideClick); return; }
    if (!p.contains(e.target) && !d.contains(e.target)) close();
  });
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function saveMatricula() {
  const curso_id = document.getElementById('f-curso')?.value;
  const turma_id = _selectedTurmaId || null;
  const obs      = document.getElementById('f-obs')?.value.trim() || null;

  if (!_selectedAlunos.length) { toast('Selecione pelo menos um aluno.', 'warning'); return; }
  if (!curso_id)                { toast('Selecione um curso.', 'warning'); return; }

  // Status gerado automaticamente pela automação
  const status = turma_id ? 'matriculado' : 'aguardando_turma';

  // Guard: turma em_andamento não aceita novas matrículas
  if (turma_id) {
    const turma = _turmas.find(t => t.id === turma_id);
    if (turma && turma.status === 'em_andamento') {
      toast('Turmas em andamento não aceitam novas matrículas.', 'warning');
      return;
    }
  }

  // Guard: duplicatas na mesma turma
  if (turma_id) {
    const dups = _selectedAlunos
      .filter(a => _matriculas.some(m => m.aluno_id === a.id && m.turma_id === turma_id && m.status !== 'cancelado'))
      .map(a => a.nome.split(' ')[0]);
    if (dups.length) {
      toast(`Já matriculado(s) nesta turma: ${dups.join(', ')}`, 'warning');
      return;
    }
  }

  // Guard: conflito de datas com turmas ativas dos alunos selecionados
  if (turma_id) {
    const turmaSel = _turmas.find(t => t.id === turma_id);
    if (turmaSel?.data_inicio) {
      const alunoIds = _selectedAlunos.map(a => a.id);
      const { data: mAtivas } = await supabase
        .from('matriculas')
        .select('aluno_id, turma:turma_id(id, codigo, data_inicio, data_fim, status)')
        .in('aluno_id', alunoIds)
        .in('status', ['em_andamento', 'matriculado'])
        .not('turma_id', 'is', null)
        .neq('turma_id', turma_id)
        .eq('tenant_id', getTenantId());

      const conflitos = [];
      for (const aluno of _selectedAlunos) {
        // Exclui turmas concluídas ou canceladas — aluno pode iniciar nova turma
        const ativas = (mAtivas ?? []).filter(m =>
          m.aluno_id === aluno.id &&
          !['concluida', 'cancelada'].includes(m.turma?.status)
        );
        for (const m of ativas) {
          if (datasConflitam(turmaSel.data_inicio, turmaSel.data_fim, m.turma?.data_inicio, m.turma?.data_fim)) {
            conflitos.push(`${aluno.nome.split(' ')[0]} ↔ turma ${m.turma?.codigo}`);
          }
        }
      }
      if (conflitos.length) {
        toast(`Conflito de datas detectado: ${conflitos.slice(0, 3).join(' | ')}`, 'warning');
        return;
      }
    }
  }

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  let ok = 0, erros = 0;

  for (const aluno of _selectedAlunos) {
    try {
      // RPC de autorização — silencioso em caso de falha
      try {
        const { data: auth, error: rpcErr } = await supabase.rpc('autorizar_matricula', {
          p_aluno_id: aluno.id,
          p_curso_id: curso_id,
        });
        if (!rpcErr && auth && !auth.autorizado) {
          toast(`${aluno.nome.split(' ')[0]}: ${auth.motivo || 'Bloqueado pelas regras de negócio.'}`, 'warning');
          erros++;
          continue;
        }
      } catch (_) { /* fallback */ }

      const { error } = await supabase.from('matriculas').insert({
        tenant_id:   getTenantId(),
        aluno_id:    aluno.id,
        curso_id,
        turma_id,
        status,
        observacoes: obs,
      });
      if (error) {
        if (error.code === '23505') throw new Error(`${aluno.nome.split(' ')[0]} já matriculado nesta turma.`);
        throw error;
      }
      ok++;
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
      erros++;
    }
  }

  closeModal();
  if (ok > 0)    toast(`${ok} matrícula${ok > 1 ? 's registradas' : ' registrada'} com sucesso!`, 'success');
  if (erros > 0) toast(`${erros} falha${erros > 1 ? 's' : ''} ao matricular.`, 'error');
  await loadMatriculas();
}

// ─── Atualização de Vagas via BD Automático ─────────────────────────────────
// A função adjustOcupadas nativa do frontend foi removida, pois a base de dados
// usa a trigger fn_sync_turma_ocupadas() para garantir ACID em incrementos.

// ─── Modal Excluir Matrícula ──────────────────────────────────────────────────
function modalExcluirMatricula(m) {
  openModal(`Excluir Matrícula`, `
    <div style="margin-bottom:16px;padding:14px;background:var(--bg-elevated);border-radius:8px;font-size:13px;color:var(--text-secondary);border-left:3px solid var(--red)">
      <strong style="color:var(--text-primary)">${esc(m.aluno_nome)}</strong><br>
      ${esc(m.curso_nome)} · Turma <span style="font-family:var(--font-mono)">${esc(m.turma_codigo)}</span>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
      Esta ação é <strong>irreversível</strong>. A matrícula será removida permanentemente e as vagas ocupadas serão ajustadas automaticamente.
    </p>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-danger" id="modal-confirm-del">Excluir Matrícula</button>
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-confirm-del')?.addEventListener('click', async () => {
    const btn = document.getElementById('modal-confirm-del');
    btn.disabled = true;
    btn.textContent = 'Excluindo...';
    try {
      const { error } = await supabase
        .from('matriculas').delete().eq('id', m.id).eq('tenant_id', getTenantId());
      if (error) throw error;
      closeModal();
      toast('Matrícula excluída.', 'success');
      await loadMatriculas();
    } catch (err) {
      toast(`Erro ao excluir: ${err.message}`, 'error');
      btn.disabled = false;
      btn.textContent = 'Excluir Matrícula';
    }
  });
}
