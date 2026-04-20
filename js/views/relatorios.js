/**
 * /js/views/relatorios.js — Hub de Exportação de Relatórios
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent } from '../ui/components.js';
import { toast } from '../ui/toast.js';

let _periodo = '30';

export async function render() {
  setContent(`
    <div class="page-header">
      <div>
        <h1>Relatórios</h1>
        <p>Exporte dados do sistema em CSV ou PDF</p>
      </div>
      <div class="page-header-actions">
        <select class="select-input" id="rel-periodo">
          <option value="30">Últimos 30 dias</option>
          <option value="m">Este mês</option>
          <option value="t">Este trimestre</option>
          <option value="y">Este ano</option>
          <option value="all">Todo o período</option>
        </select>
      </div>
    </div>
    <div id="rel-grid" class="rel-grid">
      ${_skeletonCards(8)}
    </div>
  `);

  document.getElementById('rel-periodo')?.addEventListener('change', e => {
    _periodo = e.target.value;
    _loadAllCounts();
  });

  await _loadAllCounts();
}

// ── Period helper ─────────────────────────────────────────────────────────────
function _getRange() {
  const today = new Date();
  let start = new Date(2000, 0, 1);
  if (_periodo === '30')  { start = new Date(today); start.setDate(today.getDate() - 30); }
  else if (_periodo === 'm') { start = new Date(today.getFullYear(), today.getMonth(), 1); }
  else if (_periodo === 't') { start = new Date(today); start.setMonth(today.getMonth() - 2, 1); }
  else if (_periodo === 'y') { start = new Date(today.getFullYear(), 0, 1); }
  return start.toLocaleDateString('en-CA');
}

// ── Report definitions ────────────────────────────────────────────────────────
const REPORTS = [
  {
    id: 'financeiro',
    title: 'Financeiro Geral',
    desc: 'Pagamentos, status e valores por aluno',
    icon: `<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`,
    color: 'var(--green)',
    dateField: 'vencimento',
    table: 'financeiro',
    select: 'id, descricao, valor, status, vencimento, created_at, aluno:aluno_id(nome), curso:curso_id(nome)',
    csvCols: [
      { label: 'ID',          key: r => r.id },
      { label: 'Aluno',       key: r => r.aluno?.nome || '—' },
      { label: 'Curso',       key: r => r.curso?.nome || '—' },
      { label: 'Descrição',   key: r => r.descricao || '—' },
      { label: 'Valor (R$)',  key: r => _fmtNum(r.valor) },
      { label: 'Status',      key: r => r.status || '—' },
      { label: 'Vencimento',  key: r => _fmtDate(r.vencimento) },
    ],
  },
  {
    id: 'matriculas',
    title: 'Matrículas',
    desc: 'Histórico completo de matrículas e status',
    icon: `<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>`,
    color: 'var(--blue)',
    dateField: 'created_at',
    table: 'matriculas',
    select: 'id, status, created_at, aluno:aluno_id(nome, email), curso:curso_id(nome), turma:turma_id(nome)',
    csvCols: [
      { label: 'ID',         key: r => r.id },
      { label: 'Aluno',      key: r => r.aluno?.nome || '—' },
      { label: 'E-mail',     key: r => r.aluno?.email || '—' },
      { label: 'Curso',      key: r => r.curso?.nome || '—' },
      { label: 'Turma',      key: r => r.turma?.nome || '—' },
      { label: 'Status',     key: r => r.status || '—' },
      { label: 'Data',       key: r => _fmtDate(r.created_at) },
    ],
  },
  {
    id: 'alunos',
    title: 'Alunos',
    desc: 'Cadastro completo de alunos ativos',
    icon: `<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>`,
    color: 'var(--accent)',
    dateField: 'created_at',
    table: 'alunos',
    select: 'id, nome, email, telefone, cpf, status, created_at',
    csvCols: [
      { label: 'ID',       key: r => r.id },
      { label: 'Nome',     key: r => r.nome || '—' },
      { label: 'E-mail',   key: r => r.email || '—' },
      { label: 'Telefone', key: r => r.telefone || '—' },
      { label: 'CPF',      key: r => r.cpf || '—' },
      { label: 'Status',   key: r => r.status || '—' },
      { label: 'Cadastro', key: r => _fmtDate(r.created_at) },
    ],
  },
  {
    id: 'turmas',
    title: 'Turmas',
    desc: 'Turmas, vagas, ocupação e datas',
    icon: `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
    color: 'var(--purple)',
    dateField: 'data_inicio',
    table: 'turmas',
    select: 'id, nome, status, vagas, ocupadas, data_inicio, data_fim, curso:curso_id(nome), instrutor:instrutor_id(nome)',
    csvCols: [
      { label: 'ID',          key: r => r.id },
      { label: 'Nome',        key: r => r.nome || '—' },
      { label: 'Curso',       key: r => r.curso?.nome || '—' },
      { label: 'Instrutor',   key: r => r.instrutor?.nome || '—' },
      { label: 'Status',      key: r => r.status || '—' },
      { label: 'Vagas',       key: r => r.vagas ?? '—' },
      { label: 'Ocupadas',    key: r => r.ocupadas ?? '—' },
      { label: 'Início',      key: r => _fmtDate(r.data_inicio) },
      { label: 'Fim',         key: r => _fmtDate(r.data_fim) },
    ],
  },
  {
    id: 'certificados',
    title: 'Certificados',
    desc: 'Certificados emitidos, válidos e vencendo',
    icon: `<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/>`,
    color: 'var(--amber)',
    dateField: 'data_emissao',
    table: 'certificados',
    select: 'id, codigo, status, validade, data_emissao, aluno:aluno_id(nome), curso:curso_id(nome)',
    csvCols: [
      { label: 'ID',       key: r => r.id },
      { label: 'Código',   key: r => r.codigo || '—' },
      { label: 'Aluno',    key: r => r.aluno?.nome || '—' },
      { label: 'Curso',    key: r => r.curso?.nome || '—' },
      { label: 'Status',   key: r => r.status || '—' },
      { label: 'Emissão',  key: r => _fmtDate(r.data_emissao) },
      { label: 'Validade', key: r => _fmtDate(r.validade) },
    ],
  },
  {
    id: 'instrutores',
    title: 'Instrutores',
    desc: 'Instrutores, especialidades e turmas ativas',
    icon: `<path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>`,
    color: 'var(--teal, #14b8a6)',
    dateField: 'created_at',
    table: 'instrutores',
    select: 'id, nome, email, telefone, especialidade, status, created_at',
    csvCols: [
      { label: 'ID',            key: r => r.id },
      { label: 'Nome',          key: r => r.nome || '—' },
      { label: 'E-mail',        key: r => r.email || '—' },
      { label: 'Telefone',      key: r => r.telefone || '—' },
      { label: 'Especialidade', key: r => r.especialidade || '—' },
      { label: 'Status',        key: r => r.status || '—' },
      { label: 'Cadastro',      key: r => _fmtDate(r.created_at) },
    ],
  },
  {
    id: 'inadimplencia',
    title: 'Inadimplência',
    desc: 'Pagamentos vencidos e em atraso',
    icon: `<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
    color: 'var(--red)',
    dateField: 'vencimento',
    table: 'financeiro',
    extraFilter: q => q.in('status', ['pendente', 'vencido', 'atraso']).lt('vencimento', new Date().toLocaleDateString('en-CA')),
    select: 'id, descricao, valor, status, vencimento, aluno:aluno_id(nome, email, telefone)',
    csvCols: [
      { label: 'ID',         key: r => r.id },
      { label: 'Aluno',      key: r => r.aluno?.nome || '—' },
      { label: 'E-mail',     key: r => r.aluno?.email || '—' },
      { label: 'Telefone',   key: r => r.aluno?.telefone || '—' },
      { label: 'Descrição',  key: r => r.descricao || '—' },
      { label: 'Valor (R$)', key: r => _fmtNum(r.valor) },
      { label: 'Vencimento', key: r => _fmtDate(r.vencimento) },
      { label: 'Status',     key: r => r.status || '—' },
    ],
  },
  {
    id: 'resumo',
    title: 'Resumo Executivo',
    desc: 'Visão consolidada: receita, matrículas, turmas',
    icon: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
    color: 'var(--accent)',
    isResume: true,
  },
];

// ── Count loader ──────────────────────────────────────────────────────────────
async function _loadAllCounts() {
  const tid   = getTenantId();
  const start = _getRange();
  const grid  = document.getElementById('rel-grid');
  if (!grid) return;

  grid.innerHTML = _skeletonCards(8);

  const counts = await Promise.all(
    REPORTS.map(async r => {
      if (r.isResume) return null;
      try {
        let q = supabase.from(r.table).select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
        if (r.dateField) q = q.gte(r.dateField, start);
        if (r.extraFilter) q = r.extraFilter(q);
        const { count } = await q;
        return count ?? 0;
      } catch { return 0; }
    })
  );

  grid.innerHTML = REPORTS.map((r, i) => _cardHTML(r, counts[i])).join('');

  // Bind export buttons
  grid.querySelectorAll('[data-rel-csv]').forEach(btn => {
    btn.addEventListener('click', () => _exportCSV(btn.dataset.relCsv));
  });
  grid.querySelectorAll('[data-rel-pdf]').forEach(btn => {
    btn.addEventListener('click', () => _exportPDF(btn.dataset.relPdf));
  });
}

// ── Card HTML ─────────────────────────────────────────────────────────────────
function _cardHTML(r, count) {
  const countLabel = r.isResume
    ? 'Múltiplas fontes'
    : `${count ?? '—'} registro${count !== 1 ? 's' : ''}`;

  const exportBtns = r.isResume
    ? `<button class="rel-btn rel-btn-pdf" data-rel-pdf="resumo" title="Exportar PDF">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
         PDF
       </button>`
    : `<button class="rel-btn rel-btn-csv" data-rel-csv="${r.id}" title="Exportar CSV">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
         CSV
       </button>
       <button class="rel-btn rel-btn-pdf" data-rel-pdf="${r.id}" title="Exportar PDF">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
         PDF
       </button>`;

  return `
    <div class="rel-card">
      <div class="rel-card-icon" style="background:${r.color}18;color:${r.color}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="20" height="20">
          ${r.icon}
        </svg>
      </div>
      <div class="rel-card-title">${r.title}</div>
      <div class="rel-card-desc">${r.desc}</div>
      <div class="rel-card-count" style="color:${r.color}">${countLabel}</div>
      <div class="rel-card-actions">${exportBtns}</div>
    </div>`;
}

function _skeletonCards(n) {
  return Array.from({ length: n }, () =>
    `<div class="rel-card rel-card-skeleton">
       <div class="skeleton" style="width:44px;height:44px;border-radius:10px;margin-bottom:14px"></div>
       <div class="skeleton" style="width:60%;height:14px;border-radius:6px;margin-bottom:8px"></div>
       <div class="skeleton" style="width:85%;height:11px;border-radius:6px;margin-bottom:14px"></div>
       <div class="skeleton" style="width:40%;height:11px;border-radius:6px"></div>
     </div>`
  ).join('');
}

// ── CSV Export ────────────────────────────────────────────────────────────────
async function _exportCSV(reportId) {
  const rep = REPORTS.find(r => r.id === reportId);
  if (!rep || !rep.csvCols) return;

  toast.info(`⏳ Gerando CSV — ${rep.title}…`, { description: 'Buscando dados…' });

  try {
    const tid   = getTenantId();
    const start = _getRange();
    let q = supabase.from(rep.table).select(rep.select).eq('tenant_id', tid);
    if (rep.dateField) q = q.gte(rep.dateField, start);
    if (rep.extraFilter) q = rep.extraFilter(q);
    q = q.order(rep.dateField || 'id', { ascending: false });

    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    const header = rep.csvCols.map(c => `"${c.label}"`).join(';');
    const body   = rows.map(r =>
      rep.csvCols.map(c => `"${String(c.key(r)).replace(/"/g, '""')}"`).join(';')
    ).join('\r\n');

    _downloadBlob(
      `\uFEFF${header}\r\n${body}`,
      `${rep.id}_${_today()}.csv`,
      'text/csv;charset=utf-8'
    );

    toast.success(`✅ CSV exportado — ${rows.length} registros`);
  } catch (err) {
    console.error('[relatorios csv]', err);
    toast.error('Erro ao exportar CSV', { description: err.message });
  }
}

// ── PDF Export ────────────────────────────────────────────────────────────────
async function _exportPDF(reportId) {
  if (reportId === 'resumo') return _exportResumePDF();

  const rep = REPORTS.find(r => r.id === reportId);
  if (!rep || !rep.csvCols) return;

  toast.info(`⏳ Gerando PDF — ${rep.title}…`, { description: 'Buscando dados…' });

  try {
    const tid   = getTenantId();
    const start = _getRange();
    let q = supabase.from(rep.table).select(rep.select).eq('tenant_id', tid);
    if (rep.dateField) q = q.gte(rep.dateField, start);
    if (rep.extraFilter) q = rep.extraFilter(q);
    q = q.order(rep.dateField || 'id', { ascending: false });

    const { data, error } = await q;
    if (error) throw error;

    const rows = data || [];
    const thead = `<tr>${rep.csvCols.map(c => `<th>${c.label}</th>`).join('')}</tr>`;
    const tbody = rows.map(r =>
      `<tr>${rep.csvCols.map(c => `<td>${c.key(r)}</td>`).join('')}</tr>`
    ).join('');

    _printWindow(rep.title, `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`, rows.length);
    toast.success(`✅ PDF pronto — ${rows.length} registros`);
  } catch (err) {
    console.error('[relatorios pdf]', err);
    toast.error('Erro ao exportar PDF', { description: err.message });
  }
}

async function _exportResumePDF() {
  toast.info('⏳ Gerando Resumo Executivo…', { description: 'Consolidando dados…' });
  try {
    const tid   = getTenantId();
    const start = _getRange();

    const [fin, mat, tur, cert] = await Promise.all([
      supabase.from('financeiro').select('valor, status').eq('tenant_id', tid).gte('vencimento', start),
      supabase.from('matriculas').select('status').eq('tenant_id', tid).gte('created_at', start),
      supabase.from('turmas').select('vagas, ocupadas, status').eq('tenant_id', tid).gte('data_inicio', start),
      supabase.from('certificados').select('status').eq('tenant_id', tid).gte('data_emissao', start),
    ]);

    const pagamentos  = fin.data  || [];
    const matriculas  = mat.data  || [];
    const turmas      = tur.data  || [];
    const certificados= cert.data || [];

    const receita = pagamentos.filter(p => p.status === 'recebido').reduce((s, p) => s + Number(p.valor || 0), 0);
    const inadimp = pagamentos.filter(p => ['pendente','vencido','atraso'].includes(p.status) && p.status !== 'recebido').reduce((s, p) => s + Number(p.valor || 0), 0);
    const concluidos = matriculas.filter(m => ['concluido','certificado_emitido'].includes(m.status)).length;
    const taxaConcl  = matriculas.length ? Math.round(concluidos / matriculas.length * 100) : 0;
    const vagasTot   = turmas.reduce((s, t) => s + (t.vagas || 0), 0);
    const ocupTot    = turmas.reduce((s, t) => s + (t.ocupadas || 0), 0);
    const taxaOcup   = vagasTot ? Math.round(ocupTot / vagasTot * 100) : 0;

    const table = `
      <table>
        <thead><tr><th>Indicador</th><th>Valor</th></tr></thead>
        <tbody>
          <tr><td>Receita do Período</td><td>${_fmtMoney(receita)}</td></tr>
          <tr><td>Inadimplência</td><td>${_fmtMoney(inadimp)}</td></tr>
          <tr><td>Total de Matrículas</td><td>${matriculas.length}</td></tr>
          <tr><td>Taxa de Conclusão</td><td>${taxaConcl}%</td></tr>
          <tr><td>Turmas no Período</td><td>${turmas.length}</td></tr>
          <tr><td>Taxa de Ocupação</td><td>${taxaOcup}%</td></tr>
          <tr><td>Certificados Emitidos</td><td>${certificados.length}</td></tr>
        </tbody>
      </table>`;

    _printWindow('Resumo Executivo', table, null);
    toast.success('✅ Resumo Executivo pronto');
  } catch (err) {
    console.error('[relatorios resumo]', err);
    toast.error('Erro ao gerar resumo', { description: err.message });
  }
}

// ── Print window ──────────────────────────────────────────────────────────────
function _printWindow(title, tableHTML, count) {
  const subtitle = count != null ? `${count} registro${count !== 1 ? 's' : ''} · Período: ${_periodLabel()}` : `Período: ${_periodLabel()}`;
  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${title}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#111;padding:32px}
      h1{font-size:20px;font-weight:700;margin-bottom:4px}
      .sub{font-size:11px;color:#666;margin-bottom:24px}
      table{width:100%;border-collapse:collapse}
      th{background:#f3f4f6;font-size:10px;text-transform:uppercase;letter-spacing:.5px;padding:8px 10px;text-align:left;border-bottom:1px solid #e5e7eb}
      td{padding:7px 10px;border-bottom:1px solid #f3f4f6;font-size:11px}
      tr:last-child td{border-bottom:none}
      @media print{@page{margin:16mm}}
    </style>
  </head><body>
    <h1>${title}</h1>
    <div class="sub">${subtitle}</div>
    ${tableHTML}
    <script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}<\/script>
  </body></html>`);
  w.document.close();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function _fmtDate(d) {
  if (!d) return '—';
  if (typeof d === 'string' && d.length === 10) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('pt-BR');
  }
  return new Date(d).toLocaleDateString('pt-BR');
}

function _fmtNum(v) {
  if (v == null) return '—';
  return Number(v).toFixed(2).replace('.', ',');
}

function _fmtMoney(v) {
  return 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function _today() {
  return new Date().toLocaleDateString('en-CA');
}

function _periodLabel() {
  const map = { '30': 'Últimos 30 dias', m: 'Este mês', t: 'Este trimestre', y: 'Este ano', all: 'Todo o período' };
  return map[_periodo] || _periodo;
}
