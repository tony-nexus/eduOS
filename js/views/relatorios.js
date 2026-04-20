/**
 * /js/views/relatorios.js — Hub de Exportação de Relatórios
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent } from '../ui/components.js';
import { toast } from '../ui/toast.js';

let _periodo = '30';

// ── Report definitions grouped by section ─────────────────────────────────────
const SECTIONS = [
  {
    label: 'Financeiro',
    icon: `<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>`,
    reports: [
      {
        id: 'financeiro',
        title: 'Financeiro Geral',
        desc: 'Pagamentos, status e valores por aluno',
        color: '#10b981',
        dateField: 'vencimento',
        table: 'financeiro',
        select: 'id, descricao, valor, status, vencimento, created_at, aluno:aluno_id(nome), curso:curso_id(nome)',
        csvCols: [
          { label: 'ID',         key: r => r.id },
          { label: 'Aluno',      key: r => r.aluno?.nome || '—' },
          { label: 'Curso',      key: r => r.curso?.nome || '—' },
          { label: 'Descrição',  key: r => r.descricao || '—' },
          { label: 'Valor (R$)', key: r => _fmtNum(r.valor) },
          { label: 'Status',     key: r => r.status || '—' },
          { label: 'Vencimento', key: r => _fmtDate(r.vencimento) },
        ],
      },
      {
        id: 'inadimplencia',
        title: 'Inadimplência',
        desc: 'Pagamentos vencidos e pendentes de cobrança',
        color: '#ef4444',
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
        desc: 'Visão consolidada: receita, matrículas, turmas e certificados',
        color: '#8b5cf6',
        isResume: true,
      },
    ],
  },
  {
    label: 'Acadêmico',
    icon: `<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>`,
    reports: [
      {
        id: 'matriculas',
        title: 'Matrículas',
        desc: 'Histórico completo de matrículas e status',
        color: '#3b82f6',
        dateField: 'created_at',
        table: 'matriculas',
        select: 'id, status, created_at, aluno:aluno_id(nome, email), curso:curso_id(nome), turma:turma_id(nome)',
        csvCols: [
          { label: 'ID',     key: r => r.id },
          { label: 'Aluno',  key: r => r.aluno?.nome || '—' },
          { label: 'E-mail', key: r => r.aluno?.email || '—' },
          { label: 'Curso',  key: r => r.curso?.nome || '—' },
          { label: 'Turma',  key: r => r.turma?.nome || '—' },
          { label: 'Status', key: r => r.status || '—' },
          { label: 'Data',   key: r => _fmtDate(r.created_at) },
        ],
      },
      {
        id: 'alunos',
        title: 'Alunos',
        desc: 'Cadastro completo de alunos com contato',
        color: '#f59e0b',
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
        id: 'certificados',
        title: 'Certificados',
        desc: 'Certificados emitidos, válidos e próximos ao vencimento',
        color: '#06b6d4',
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
    ],
  },
  {
    label: 'Operacional',
    icon: `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
    reports: [
      {
        id: 'turmas',
        title: 'Turmas',
        desc: 'Turmas, vagas, ocupação e datas de início e fim',
        color: '#a855f7',
        dateField: 'data_inicio',
        table: 'turmas',
        select: 'id, nome, status, vagas, ocupadas, data_inicio, data_fim, curso:curso_id(nome), instrutor:instrutor_id(nome)',
        csvCols: [
          { label: 'ID',        key: r => r.id },
          { label: 'Nome',      key: r => r.nome || '—' },
          { label: 'Curso',     key: r => r.curso?.nome || '—' },
          { label: 'Instrutor', key: r => r.instrutor?.nome || '—' },
          { label: 'Status',    key: r => r.status || '—' },
          { label: 'Vagas',     key: r => r.vagas ?? '—' },
          { label: 'Ocupadas',  key: r => r.ocupadas ?? '—' },
          { label: 'Início',    key: r => _fmtDate(r.data_inicio) },
          { label: 'Fim',       key: r => _fmtDate(r.data_fim) },
        ],
      },
      {
        id: 'instrutores',
        title: 'Instrutores',
        desc: 'Instrutores, especialidades e status no sistema',
        color: '#14b8a6',
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
    ],
  },
];

const REPORTS = SECTIONS.flatMap(s => s.reports);

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
    <div id="rel-body" class="rel-body">
      ${_skeletonSections()}
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

// ── Count loader ──────────────────────────────────────────────────────────────
async function _loadAllCounts() {
  const tid   = getTenantId();
  const start = _getRange();
  const body  = document.getElementById('rel-body');
  if (!body) return;

  body.innerHTML = _skeletonSections();

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

  // Build count map
  const countMap = {};
  REPORTS.forEach((r, i) => { countMap[r.id] = counts[i]; });

  body.innerHTML = SECTIONS.map(s => _sectionHTML(s, countMap)).join('');

  body.querySelectorAll('[data-rel-csv]').forEach(btn => {
    btn.addEventListener('click', () => _exportCSV(btn.dataset.relCsv));
  });
  body.querySelectorAll('[data-rel-pdf]').forEach(btn => {
    btn.addEventListener('click', () => _exportPDF(btn.dataset.relPdf));
  });
}

// ── Section HTML ──────────────────────────────────────────────────────────────
function _sectionHTML(section, countMap) {
  const rows = section.reports.map(r => _rowHTML(r, countMap[r.id])).join('');
  return `
    <div class="rel-section">
      <div class="rel-section-header">
        <svg class="rel-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14">
          ${section.icon}
        </svg>
        <span class="rel-section-label">${section.label}</span>
      </div>
      <div class="rel-section-list">
        ${rows}
      </div>
    </div>`;
}

function _rowHTML(r, count) {
  const countBadge = r.isResume
    ? `<span class="rel-row-badge" style="background:${r.color}18;color:${r.color}">Consolidado</span>`
    : `<span class="rel-row-badge" style="background:${r.color}18;color:${r.color}">${count ?? '—'} registros</span>`;

  const csvBtn = r.isResume ? '' : `
    <button class="rel-action-btn rel-action-csv" data-rel-csv="${r.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
        <polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/>
        <path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.29"/>
      </svg>
      CSV
    </button>`;

  const pdfBtn = `
    <button class="rel-action-btn rel-action-pdf" data-rel-pdf="${r.isResume ? 'resumo' : r.id}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      PDF
    </button>`;

  return `
    <div class="rel-row">
      <div class="rel-row-dot" style="background:${r.color}"></div>
      <div class="rel-row-info">
        <span class="rel-row-title">${r.title}</span>
        <span class="rel-row-desc">${r.desc}</span>
      </div>
      <div class="rel-row-right">
        ${countBadge}
        <div class="rel-row-actions">
          ${csvBtn}
          ${pdfBtn}
        </div>
      </div>
    </div>`;
}

function _skeletonSections() {
  const skRow = `
    <div class="rel-row rel-row-skeleton">
      <div class="skeleton" style="width:6px;height:6px;border-radius:50%;flex-shrink:0"></div>
      <div style="flex:1;display:flex;flex-direction:column;gap:6px">
        <div class="skeleton" style="width:30%;height:13px;border-radius:5px"></div>
        <div class="skeleton" style="width:55%;height:11px;border-radius:5px"></div>
      </div>
      <div class="skeleton" style="width:80px;height:24px;border-radius:20px"></div>
    </div>`;
  return [
    { label: 'Financeiro', n: 3 },
    { label: 'Acadêmico',  n: 3 },
    { label: 'Operacional',n: 2 },
  ].map(s => `
    <div class="rel-section">
      <div class="rel-section-header">
        <div class="skeleton" style="width:14px;height:14px;border-radius:3px"></div>
        <div class="skeleton" style="width:90px;height:12px;border-radius:5px"></div>
      </div>
      <div class="rel-section-list">${skRow.repeat(s.n)}</div>
    </div>`).join('');
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

    const rows   = data || [];
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

    const rows  = data || [];
    const thead = `<tr>${rep.csvCols.map(c => `<th>${c.label}</th>`).join('')}</tr>`;
    const tbody = rows.map(r =>
      `<tr>${rep.csvCols.map(c => `<td>${c.key(r)}</td>`).join('')}</tr>`
    ).join('');

    _printWindow(rep.title, rep.color, `<table><thead>${thead}</thead><tbody>${tbody}</tbody></table>`, rows.length);
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

    const pagamentos   = fin.data  || [];
    const matriculas   = mat.data  || [];
    const turmas       = tur.data  || [];
    const certificados = cert.data || [];

    const receita   = pagamentos.filter(p => p.status === 'recebido').reduce((s, p) => s + Number(p.valor || 0), 0);
    const inadimp   = pagamentos.filter(p => ['pendente','vencido','atraso'].includes(p.status)).reduce((s, p) => s + Number(p.valor || 0), 0);
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
          <tr><td>Inadimplência (pendente)</td><td>${_fmtMoney(inadimp)}</td></tr>
          <tr><td>Total de Matrículas</td><td>${matriculas.length}</td></tr>
          <tr><td>Taxa de Conclusão</td><td>${taxaConcl}%</td></tr>
          <tr><td>Turmas no Período</td><td>${turmas.length}</td></tr>
          <tr><td>Taxa de Ocupação</td><td>${taxaOcup}%</td></tr>
          <tr><td>Certificados Emitidos</td><td>${certificados.length}</td></tr>
        </tbody>
      </table>`;

    _printWindow('Resumo Executivo', '#8b5cf6', table, null);
    toast.success('✅ Resumo Executivo pronto');
  } catch (err) {
    console.error('[relatorios resumo]', err);
    toast.error('Erro ao gerar resumo', { description: err.message });
  }
}

// ── Print window ──────────────────────────────────────────────────────────────
function _printWindow(title, accentColor, tableHTML, count) {
  const subtitle = count != null
    ? `${count} registro${count !== 1 ? 's' : ''} · Período: ${_periodLabel()}`
    : `Período: ${_periodLabel()}`;
  const w = window.open('', '_blank', 'width=960,height=720');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${title}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#111;padding:40px 48px;background:#fff}
      .header{display:flex;align-items:center;gap:12px;margin-bottom:28px;border-bottom:2px solid ${accentColor};padding-bottom:16px}
      .header-dot{width:10px;height:10px;border-radius:50%;background:${accentColor};flex-shrink:0}
      h1{font-size:18px;font-weight:700;color:#111;margin:0}
      .sub{font-size:11px;color:#6b7280;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-top:0}
      th{background:${accentColor}14;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;padding:9px 12px;text-align:left;color:${accentColor};border-bottom:1px solid ${accentColor}30}
      td{padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:11.5px;color:#374151}
      tr:hover td{background:#f9fafb}
      tr:last-child td{border-bottom:none}
      .footer{margin-top:24px;font-size:10px;color:#9ca3af;text-align:right}
      @media print{@page{margin:14mm}body{padding:0}.footer{display:none}}
    </style>
  </head><body>
    <div class="header">
      <div class="header-dot"></div>
      <div>
        <h1>${title}</h1>
        <div class="sub">${subtitle}</div>
      </div>
    </div>
    ${tableHTML}
    <div class="footer">Gerado em ${new Date().toLocaleString('pt-BR')}</div>
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
