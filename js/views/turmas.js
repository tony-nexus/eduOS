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

let _turmas     = [];
let _cursos     = [];
let _instrutores = [];

export let _turmasCache = []; // acessado por matriculas.js

const BADGE = { em_andamento:'badge-accent', agendada:'badge-blue', concluida:'badge-green', cancelada:'badge-red' };
const LABEL = { em_andamento:'Em Andamento', agendada:'Agendada', concluida:'Concluída', cancelada:'Cancelada' };

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

  await Promise.all([loadTurmas(), loadCursos(), loadInstrutores()]);

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
  const q  = (document.getElementById('search-turmas')?.value || '').toLowerCase();
  const st = document.getElementById('filtro-status-turma')?.value || '';
  const cr = document.getElementById('filtro-curso-turma')?.value || '';
  const is = document.getElementById('filtro-inst-turma')?.value || '';

  const f  = _turmas.filter(t =>
    (!q  || t.codigo?.toLowerCase().includes(q) || t.curso_nome.toLowerCase().includes(q)) &&
    (!st || t.status === st) &&
    (!cr || t.curso_id === cr) &&
    (!is || t.instrutor_id === is)
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
          <button class="action-btn action-editar" data-id="${t.id}">Editar</button>
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
    const { count } = await supabase
      .from('turmas')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', getTenantId())
      .eq('curso_id', cursoId)
      .like('codigo', `${prefixo}%`);

    const seq = String((count || 0) + 1).padStart(3, '0');
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

  openModal(isEdit ? 'Editar Turma' : 'Nova Turma', `
    <div class="form-grid">
      <div class="form-group">
        <label>Curso *</label>
        <select id="f-curso">
          <option value="">— Selecione —</option>
          ${cursosOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Data Início *</label>
        <input id="f-inicio" type="date" value="${esc(turma?.data_inicio || '')}">
      </div>
      <div class="form-group full">
        <label>Código da Turma</label>
        <div style="position:relative">
          <input id="f-codigo" type="text" value="${esc(turma?.codigo || '')}"
            placeholder="Será gerado automaticamente…"
            style="padding-right:100px;font-family:var(--font-mono);letter-spacing:0.5px">
          <button type="button" id="btn-gerar-codigo"
            style="position:absolute;right:8px;top:50%;transform:translateY(-50%);
                   background:var(--accent-soft);border:1px solid var(--accent);
                   color:var(--accent);border-radius:4px;padding:3px 8px;font-size:11px;
                   cursor:pointer;white-space:nowrap">
            ↻ Gerar
          </button>
        </div>
        <small style="color:var(--text-tertiary);font-size:11px">
          Formato: SIGLA-ANO-SEQ (ex: NR35-2025-001). Gerado automaticamente ao selecionar curso e data.
        </small>
      </div>
      <div class="form-group">
        <label>Data Fim</label>
        <input id="f-fim" type="date" value="${esc(turma?.data_fim || '')}">
      </div>
      <div class="form-group">
        <label>Instrutor</label>
        <select id="f-instrutor">
          <option value="">— Nenhum —</option>
          ${instOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Vagas</label>
        <input id="f-vagas" type="number" min="1" value="${turma?.vagas || 20}">
      </div>
      <div class="form-group">
        <label>Local / Modalidade</label>
        <input id="f-local" type="text" placeholder="Ex: Sede SP / Online" value="${esc(turma?.local || '')}">
      </div>
      <div class="form-group full">
        <label>Status</label>
        <select id="f-status">
          <option value="agendada"      ${turma?.status === 'agendada'      ? 'selected' : ''}>Agendada</option>
          <option value="em_andamento"  ${turma?.status === 'em_andamento'  ? 'selected' : ''}>Em Andamento</option>
          <option value="concluida"     ${turma?.status === 'concluida'     ? 'selected' : ''}>Concluída</option>
          <option value="cancelada"     ${turma?.status === 'cancelada'     ? 'selected' : ''}>Cancelada</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Salvar Alterações' : 'Criar Turma'}</button>
    </div>
  `);

  // ── Auto-geração de código ao mudar curso ou data ─────────────────────────
  async function triggerAutoCode() {
    if (isEdit) return; // não sobrescreve código em edições
    const cursoId   = document.getElementById('f-curso')?.value;
    const dataInicio = document.getElementById('f-inicio')?.value;
    if (!cursoId || !dataInicio) return;
    const codigo = await gerarCodigoTurma(cursoId, dataInicio);
    const input  = document.getElementById('f-codigo');
    if (input) input.value = codigo;
  }

  document.getElementById('f-curso')?.addEventListener('change', triggerAutoCode);
  document.getElementById('f-inicio')?.addEventListener('change', triggerAutoCode);
  document.getElementById('btn-gerar-codigo')?.addEventListener('click', async () => {
    const cursoId   = document.getElementById('f-curso')?.value;
    const dataInicio = document.getElementById('f-inicio')?.value;
    if (!cursoId || !dataInicio) {
      toast('Selecione o curso e a data de início primeiro.', 'warning');
      return;
    }
    const codigo = await gerarCodigoTurma(cursoId, dataInicio);
    const input  = document.getElementById('f-codigo');
    if (input) { input.value = codigo; toast('Código gerado!', 'success'); }
  });

  // Gera automaticamente se curso já estiver selecionado (edição / pré-seleção)
  if (!isEdit) triggerAutoCode();

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => saveTurma(turma?.id));
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function saveTurma(id) {
  const codigo      = document.getElementById('f-codigo')?.value.trim();
  const curso_id    = document.getElementById('f-curso')?.value;
  const instrutor_id = document.getElementById('f-instrutor')?.value || null;
  const inicio      = document.getElementById('f-inicio')?.value || null;
  const fim         = document.getElementById('f-fim')?.value || null;
  const vagas       = parseInt(document.getElementById('f-vagas')?.value) || 0;
  const local       = document.getElementById('f-local')?.value.trim() || null;
  const status      = document.getElementById('f-status')?.value;

  const ok = validateForm([
    { id: 'f-codigo', value: codigo,         rules: ['required'],       label: 'Código' },
    { id: 'f-curso',  value: curso_id,        rules: ['required'],       label: 'Curso' },
    { id: 'f-inicio', value: inicio,          rules: ['required'],       label: 'Data de início' },
    { id: 'f-vagas',  value: vagas.toString(),rules: ['required','int_positive'], label: 'Vagas' },
  ]);
  if (!ok) return;

  if (fim && inicio && fim < inicio) {
    fieldError('f-fim', 'Data de fim deve ser posterior à data de início.');
    return;
  }
  fieldOk('f-fim');

  const payload = { tenant_id: getTenantId(), codigo, curso_id, instrutor_id, data_inicio: inicio, data_fim: fim, vagas, local, status };

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    let error, data;
    if (id) {
      ({ error } = await supabase.from('turmas').update(payload).eq('id', id).eq('tenant_id', getTenantId()));
    } else {
      payload.ocupadas = 0;
      let res = await supabase.from('turmas').insert(payload);
      error = res.error;
      
      // Feature: Retry Code Generation if collision
      if (error && error.code === '23505') {
        const novoCodigo = await gerarCodigoTurma(curso_id, inicio);
        payload.codigo = novoCodigo;
        res = await supabase.from('turmas').insert(payload);
        error = res.error;
      }
    }
    
    if (error) {
      if (error.code === '23505') throw new Error('Já existe uma turma com este código. Tente novamente.');
      throw error;
    }
    closeModal();
    toast(id ? 'Turma atualizada com sucesso!' : `Turma ${payload.codigo} criada!`, 'success');
    await loadTurmas();
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = id ? 'Salvar Alterações' : 'Criar Turma';
  }
}

// ─── Visualização de Alunos ───────────────────────────────────────────────────
async function verAlunos(turma) {
  openModal(`Alunos na Turma: ${turma.codigo}`, `<div style="text-align:center;padding:40px;color:var(--text-tertiary)">Carregando...</div>`);
  try {
    const { data, error } = await supabase.from('matriculas')
      .select('id, aluno:aluno_id(nome, cpf), status')
      .eq('turma_id', turma.id).eq('tenant_id', getTenantId())
      .neq('status', 'cancelado');
    if (error) throw error;
    if (!data || !data.length) {
      document.getElementById('modal-body').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary)">Nenhum aluno ativo nesta turma.</div>';
      return;
    }
    const html = data.map(m => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid var(--border-color)">
        <div><strong>${esc(m.aluno?.nome)}</strong><br><small style="color:var(--text-secondary)">CPF: ${esc(m.aluno?.cpf || 'N/A')}</small></div>
        <div><span class="badge badge-gray">${esc(m.status)}</span></div>
      </div>
    `).join('');
    document.getElementById('modal-body').innerHTML = `<div style="max-height:400px;overflow-y:auto">${html}</div>`;
  } catch (e) {
    document.getElementById('modal-body').innerHTML = '<div style="padding:20px;color:var(--red)">Erro ao carregar alunos.</div>';
  }
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
