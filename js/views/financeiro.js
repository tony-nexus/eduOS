/**
 * /js/views/financeiro.js
 * Gestão financeira — 3 abas: Cobranças | Resumo Mensal | Inadimplência
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast, fmtMoney, fmtDate, esc } from '../ui/components.js';
import { validateForm } from '../ui/validate.js';
import { initDatePicker } from '../ui/date-picker.js';

let _pagamentos = [];
let _matriculas = [];
let _abaAtiva   = 'cobrancas';
let _filterPickers = [];

const STATUS_LABEL = { pendente:'Pendente', recebido:'Recebido', atraso:'Em Atraso', cancelado:'Cancelado', isento:'Isento' };
const STATUS_BADGE = { pendente:'badge-amber', recebido:'badge-green', atraso:'badge-red', cancelado:'badge-gray', isento:'badge-purple' };
const TIPO_LABEL   = { pix:'PIX', boleto:'Boleto', cartao_credito:'Cartão Crédito', cartao_debito:'Cartão Débito', transferencia:'Transferência', dinheiro:'Dinheiro', cheque:'Cheque' };

// ─── Render principal ─────────────────────────────────────────────────────────
export async function render() {
  // Destrói pickers de filtro de render anterior (navegação)
  _filterPickers.forEach(p => { try { p.destroy(); } catch {} });
  _filterPickers = [];

  setContent(`
    <div class="page-header">
      <div><h1>Financeiro</h1><p>Cobranças, recebimentos e análise de inadimplência</p></div>
      <div class="page-header-actions">
        <button class="btn btn-secondary" id="btn-exportar-fin">Exportar CSV</button>
        <button class="btn btn-primary" id="btn-registrar-pag">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Registrar Cobrança
        </button>
      </div>
    </div>

    <!-- KPIs -->
    <div class="stats-row" id="fin-kpis">
      ${Array(5).fill('<div class="stat-card"><div class="skeleton" style="height:44px;width:100%"></div></div>').join('')}
    </div>

    <!-- Tab bar -->
    <div style="display:flex;gap:2px;border-bottom:1px solid var(--border-subtle);margin-bottom:20px;margin-top:4px">
      ${['cobrancas:Cobranças','resumo:Resumo Mensal','inadimplencia:Inadimplência'].map(t => {
        const [id, label] = t.split(':');
        return `<button class="fin-tab" data-tab="${id}" style="
          padding:9px 18px;font-size:13px;font-weight:500;border:none;background:none;
          cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;
          color:var(--text-secondary);transition:color .15s,border-color .15s">
          ${label}
        </button>`;
      }).join('')}
    </div>

    <!-- Conteúdo das abas -->
    <div id="fin-tab-content"></div>
  `);

  document.getElementById('btn-registrar-pag')?.addEventListener('click', () => modalPagamento());
  document.getElementById('btn-exportar-fin')?.addEventListener('click', exportarCSV);

  document.querySelectorAll('.fin-tab').forEach(btn =>
    btn.addEventListener('click', () => setAba(btn.dataset.tab))
  );

  await Promise.all([loadData(), loadAux()]);

  setAba(_abaAtiva);

  // Pickers de filtro (nível de página — fora de modal)
  const pDe  = document.getElementById('filtro-data-de');
  const pAte = document.getElementById('filtro-data-ate');
  if (pDe)  _filterPickers.push(initDatePicker(pDe));
  if (pAte) _filterPickers.push(initDatePicker(pAte));
}

// ─── Troca de aba ─────────────────────────────────────────────────────────────
function setAba(aba) {
  _abaAtiva = aba;
  document.querySelectorAll('.fin-tab').forEach(btn => {
    const active = btn.dataset.tab === aba;
    btn.style.color        = active ? 'var(--accent)'  : 'var(--text-secondary)';
    btn.style.borderColor  = active ? 'var(--accent)'  : 'transparent';
    btn.style.fontWeight   = active ? '600' : '500';
  });

  const content = document.getElementById('fin-tab-content');
  if (!content) return;

  if (aba === 'cobrancas')    renderAbaCobrancas(content);
  if (aba === 'resumo')       renderAbaResumo(content);
  if (aba === 'inadimplencia') renderAbaInadimplencia(content);
}

// ─── Fetches ──────────────────────────────────────────────────────────────────
async function loadAux() {
  try {
    const { data } = await supabase
      .from('matriculas')
      .select('id, aluno:aluno_id(id, nome), curso:curso_id(id, nome, valor_padrao), turma:turma_id(data_inicio)')
      .eq('tenant_id', getTenantId());
    _matriculas = data || [];
  } catch (_) { _matriculas = []; }
}

async function loadData() {
  await autoMarkAtrasados();
  try {
    const { data, error } = await supabase
      .from('pagamentos')
      .select('*, aluno:aluno_id(nome), curso:curso_id(nome)')
      .eq('tenant_id', getTenantId())
      .order('data_vencimento', { ascending: false });

    if (error) throw error;
    _pagamentos = (data || []).map(p => ({
      ...p,
      aluno_nome: p.aluno?.nome || '—',
      curso_nome: p.curso?.nome || '—',
    }));
  } catch (_) {
    toast('Erro ao carregar pagamentos', 'error');
    _pagamentos = [];
  }
  renderKPIs(_pagamentos);
}

async function autoMarkAtrasados() {
  const hoje = new Date().toISOString().split('T')[0];
  try {
    await supabase.from('pagamentos')
      .update({ status: 'atraso' })
      .eq('tenant_id', getTenantId())
      .eq('status', 'pendente')
      .lt('data_vencimento', hoje);
  } catch (e) {
    console.warn('[Financeiro] autoMarkAtrasados:', e.message);
  }
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function renderKPIs(pags) {
  let recebido = 0, pendente = 0, atraso = 0;
  let qtdRec = 0, qtdPend = 0, qtdAtr = 0;

  pags.forEach(p => {
    const v = Number(p.valor) || 0;
    if      (p.status === 'recebido') { recebido += v; qtdRec++;  }
    else if (p.status === 'pendente') { pendente += v; qtdPend++; }
    else if (p.status === 'atraso')   { atraso   += v; qtdAtr++;  }
  });

  const emAberto      = pendente + atraso;
  const inadimplencia = emAberto > 0 ? Math.round(atraso / emAberto * 100) : 0;
  const inadColor     = inadimplencia > 20 ? 'var(--red)' : inadimplencia > 10 ? 'var(--amber)' : 'var(--green)';

  const el = document.getElementById('fin-kpis');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Recebido</div>
      <div class="stat-value" style="color:var(--green)">${fmtMoney(recebido)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${qtdRec} pagamento${qtdRec !== 1 ? 's' : ''}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Em Aberto</div>
      <div class="stat-value">${fmtMoney(emAberto)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${qtdPend + qtdAtr} cobranças</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Pendente</div>
      <div class="stat-value" style="color:var(--amber)">${fmtMoney(pendente)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${qtdPend} cobrança${qtdPend !== 1 ? 's' : ''}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Em Atraso</div>
      <div class="stat-value" style="color:var(--red)">${fmtMoney(atraso)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${qtdAtr} cobrança${qtdAtr !== 1 ? 's' : ''}</div>
    </div>
    <div class="stat-card" style="${inadimplencia > 20 ? 'border-color:var(--red-soft)' : ''}">
      <div class="stat-label">Inadimplência</div>
      <div class="stat-value" style="color:${inadColor}">${inadimplencia}%</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">do valor em aberto</div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
// ABA 1 — COBRANÇAS
// ══════════════════════════════════════════════════════════════

function renderAbaCobrancas(container) {
  container.innerHTML = `
    <div class="table-wrap">
      <div class="table-toolbar" style="flex-wrap:wrap;gap:8px">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-fin" placeholder="Aluno ou recibo...">
        </div>
        <select class="select-input" id="filtro-status-fin">
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="recebido">Recebido</option>
          <option value="atraso">Em Atraso</option>
          <option value="isento">Isento</option>
          <option value="cancelado">Cancelado</option>
        </select>
        <select class="select-input" id="filtro-tipo-fin">
          <option value="">Todos os tipos</option>
          <option value="pix">PIX</option>
          <option value="boleto">Boleto</option>
          <option value="cartao_credito">Cartão Crédito</option>
          <option value="cartao_debito">Cartão Débito</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="transferencia">Transferência</option>
        </select>
        <select class="select-input" id="filtro-curso-fin">
          <option value="">Todos os cursos</option>
        </select>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11.5px;color:var(--text-tertiary);white-space:nowrap">Venc. de</span>
          <input type="text" class="select-input dp-input" id="filtro-data-de" placeholder="AAAA-MM-DD" readonly style="width:110px">
          <span style="font-size:11.5px;color:var(--text-tertiary)">até</span>
          <input type="text" class="select-input dp-input" id="filtro-data-ate" placeholder="AAAA-MM-DD" readonly style="width:110px">
        </div>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Curso</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Pago em</th>
              <th>Tipo</th>
              <th>Status</th>
              <th style="text-align:center">Comp.</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody id="fin-tbody"></tbody>
        </table>
      </div>
    </div>
  `;

  // Preenche filtro de cursos
  const cursos = [...new Map(_matriculas.map(m => [m.curso?.id, m.curso])).values()].filter(Boolean);
  const fCurso = document.getElementById('filtro-curso-fin');
  if (fCurso) cursos.forEach(c => fCurso.innerHTML += `<option value="${c.id}">${esc(c.nome)}</option>`);

  ['search-fin','filtro-status-fin','filtro-tipo-fin','filtro-curso-fin','filtro-data-de','filtro-data-ate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('input', applyFilter); el.addEventListener('change', applyFilter); }
  });

  applyFilter();
}

function applyFilter() {
  const q    = (document.getElementById('search-fin')?.value || '').toLowerCase();
  const st   = document.getElementById('filtro-status-fin')?.value || '';
  const tipo = document.getElementById('filtro-tipo-fin')?.value   || '';
  const cr   = document.getElementById('filtro-curso-fin')?.value  || '';
  const de   = document.getElementById('filtro-data-de')?.value    || '';
  const ate  = document.getElementById('filtro-data-ate')?.value   || '';

  const f = _pagamentos.filter(p =>
    (!q    || p.aluno_nome.toLowerCase().includes(q) || (p.recibo||'').toLowerCase().includes(q)) &&
    (!st   || p.status === st) &&
    (!tipo || p.tipo_pagamento === tipo) &&
    (!cr   || p.curso_id === cr) &&
    (!de   || (p.data_vencimento && p.data_vencimento >= de)) &&
    (!ate  || (p.data_vencimento && p.data_vencimento <= ate))
  );

  const tbody = document.getElementById('fin-tbody');
  if (!tbody) return;

  if (!f.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--text-tertiary)">Nenhum pagamento encontrado.</td></tr>`;
    return;
  }

  const hoje = new Date().toISOString().split('T')[0];

  tbody.innerHTML = f.map(p => {
    const diasAtraso = p.status === 'atraso' && p.data_vencimento
      ? Math.floor((new Date(hoje) - new Date(p.data_vencimento)) / 86400000) : 0;
    const rowStyle = p.status === 'atraso' ? 'background:rgba(var(--red-rgb,220,38,38),0.04)' : '';

    return `
    <tr style="${rowStyle}">
      <td>
        <div style="font-weight:500;font-size:13px">${esc(p.aluno_nome)}</div>
        ${p.recibo ? `<div style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-tertiary)">${esc(p.recibo)}</div>` : ''}
      </td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${esc(p.curso_nome)}</td>
      <td style="font-family:var(--font-mono);font-size:13px;font-weight:600">${fmtMoney(p.valor || 0)}</td>
      <td>
        <div style="font-size:12.5px">${p.data_vencimento ? fmtDate(p.data_vencimento) : '—'}</div>
        ${diasAtraso > 0 ? `<div style="font-size:10.5px;color:var(--red);margin-top:2px">${diasAtraso}d em atraso</div>` : ''}
      </td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${p.data_pagamento ? fmtDate(p.data_pagamento) : '—'}</td>
      <td>
        ${p.tipo_pagamento
          ? `<span class="badge badge-gray" style="font-size:10.5px">${esc(TIPO_LABEL[p.tipo_pagamento] ?? p.tipo_pagamento)}</span>`
          : '<span style="color:var(--text-tertiary)">—</span>'}
      </td>
      <td><span class="badge ${STATUS_BADGE[p.status] ?? 'badge-gray'}">${STATUS_LABEL[p.status] ?? p.status}</span></td>
      <td style="text-align:center">
        ${p.comprovante_url
          ? `<button class="action-btn btn-ver-comp" data-path="${esc(p.comprovante_url)}"
               style="color:var(--accent);border-color:var(--accent);padding:3px 8px;display:inline-flex;align-items:center;gap:4px">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>Ver
             </button>`
          : '<span style="color:var(--text-tertiary);font-size:11px">—</span>'}
      </td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:nowrap">
          ${p.status !== 'recebido' && p.status !== 'cancelado' && p.status !== 'isento'
            ? `<button class="action-btn action-confirmar" data-id="${p.id}"
                 style="color:var(--green);border-color:var(--green)">Confirmar</button>`
            : ''}
          ${p.status === 'recebido'
            ? `<button class="action-btn btn-recibo-pdf" data-id="${p.id}">Recibo</button>` : ''}
          <button class="action-btn action-editar" data-id="${p.id}">Editar</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.action-confirmar').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = _pagamentos.find(x => x.id === btn.dataset.id);
      if (p) modalConfirmarPagamento(p);
    });
  });
  document.querySelectorAll('.action-editar').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = _pagamentos.find(x => x.id === btn.dataset.id);
      if (p) modalPagamento(p);
    });
  });
  document.querySelectorAll('.btn-ver-comp').forEach(btn => {
    btn.addEventListener('click', () => verComprovante(btn.dataset.path));
  });
  document.querySelectorAll('.btn-recibo-pdf').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = _pagamentos.find(x => x.id === btn.dataset.id);
      if (p) gerarReciboPDF(p);
    });
  });
}

// ══════════════════════════════════════════════════════════════
// ABA 2 — RESUMO MENSAL
// ══════════════════════════════════════════════════════════════

function renderAbaResumo(container) {
  // Agrupa recebimentos por mês (últimos 6 meses)
  const hoje     = new Date();
  const meses    = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '').toUpperCase(),
      rec:   0, pend: 0, atr: 0,
    });
  }

  _pagamentos.forEach(p => {
    const key = (p.data_vencimento || p.created_at || '').substring(0, 7);
    const m   = meses.find(x => x.key === key);
    if (!m) return;
    const v = Number(p.valor) || 0;
    if      (p.status === 'recebido') m.rec  += v;
    else if (p.status === 'pendente') m.pend += v;
    else if (p.status === 'atraso')   m.atr  += v;
  });

  const maxVal = Math.max(...meses.map(m => m.rec + m.pend + m.atr), 1);

  // Breakdown por forma de pagamento
  const tipoMap = {};
  _pagamentos.filter(p => p.status === 'recebido' && p.tipo_pagamento).forEach(p => {
    tipoMap[p.tipo_pagamento] = (tipoMap[p.tipo_pagamento] || 0) + Number(p.valor || 0);
  });
  const tipoTotal = Object.values(tipoMap).reduce((a, b) => a + b, 0) || 1;
  const tipoEntries = Object.entries(tipoMap).sort((a, b) => b[1] - a[1]);

  container.innerHTML = `
    <div class="dash-grid-2" style="margin-bottom:20px">

      <!-- Gráfico de barras mensal -->
      <div class="card" style="padding:20px">
        <div style="font-size:13px;font-weight:600;margin-bottom:16px">Receita últimos 6 meses</div>
        <div style="display:flex;align-items:flex-end;gap:10px;height:140px;padding-bottom:28px;position:relative">
          ${meses.map(m => {
            const total = m.rec + m.pend + m.atr;
            const hRec  = total > 0 ? Math.round((m.rec  / maxVal) * 120) : 0;
            const hPend = total > 0 ? Math.round((m.pend / maxVal) * 120) : 0;
            const hAtr  = total > 0 ? Math.round((m.atr  / maxVal) * 120) : 0;
            return `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:0;position:relative" title="${m.label}: ${fmtMoney(total)}">
                <div style="display:flex;flex-direction:column;justify-content:flex-end;height:120px;width:100%;gap:1px">
                  ${hAtr  > 0 ? `<div style="height:${hAtr}px;background:var(--red);opacity:.8;border-radius:2px 2px 0 0;min-height:2px"></div>` : ''}
                  ${hPend > 0 ? `<div style="height:${hPend}px;background:var(--amber);opacity:.8;border-radius:${hAtr > 0 ? '0' : '2px 2px 0 0'};min-height:2px"></div>` : ''}
                  ${hRec  > 0 ? `<div style="height:${hRec}px;background:var(--green);opacity:.85;border-radius:${(hAtr + hPend) > 0 ? '0' : '2px 2px 0 0'};min-height:2px"></div>` : ''}
                  ${total === 0 ? `<div style="height:2px;background:var(--border-subtle);border-radius:2px"></div>` : ''}
                </div>
                <div style="font-size:10px;color:var(--text-tertiary);margin-top:6px;position:absolute;bottom:-20px;white-space:nowrap">${m.label}</div>
              </div>`;
          }).join('')}
        </div>
        <!-- Legenda -->
        <div style="display:flex;gap:14px;margin-top:8px;font-size:11px;color:var(--text-secondary)">
          <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block"></span>Recebido</span>
          <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--amber);display:inline-block"></span>Pendente</span>
          <span style="display:flex;align-items:center;gap:4px"><span style="width:8px;height:8px;border-radius:50%;background:var(--red);display:inline-block"></span>Atraso</span>
        </div>
      </div>

      <!-- Breakdown por forma de pagamento -->
      <div class="card" style="padding:20px">
        <div style="font-size:13px;font-weight:600;margin-bottom:16px">Formas de pagamento recebidas</div>
        ${tipoEntries.length === 0
          ? `<div style="color:var(--text-tertiary);font-size:13px;padding:20px 0;text-align:center">Nenhum recebimento registrado</div>`
          : tipoEntries.map(([tipo, val]) => {
              const pct = Math.round((val / tipoTotal) * 100);
              return `
                <div style="margin-bottom:14px">
                  <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px">
                    <span style="font-weight:500">${esc(TIPO_LABEL[tipo] ?? tipo)}</span>
                    <span style="font-family:var(--font-mono);color:var(--green)">${fmtMoney(val)} <span style="color:var(--text-tertiary);font-size:11px">${pct}%</span></span>
                  </div>
                  <div style="height:6px;background:var(--bg-elevated);border-radius:99px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:99px;transition:width .4s"></div>
                  </div>
                </div>`;
            }).join('')}
      </div>
    </div>

    <!-- Tabela mensal detalhada -->
    <div class="card" style="padding:20px">
      <div style="font-size:13px;font-weight:600;margin-bottom:14px">Detalhe por mês</div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr><th>Mês</th><th>Recebido</th><th>Pendente</th><th>Em Atraso</th><th>Total em Aberto</th><th>% Cumprimento</th></tr></thead>
          <tbody>
            ${meses.map(m => {
              const aberto = m.pend + m.atr;
              const total  = m.rec + aberto;
              const pct    = total > 0 ? Math.round((m.rec / total) * 100) : 0;
              const pctColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
              return `
              <tr>
                <td style="font-weight:500">${m.label}</td>
                <td style="font-family:var(--font-mono);color:var(--green)">${fmtMoney(m.rec)}</td>
                <td style="font-family:var(--font-mono);color:var(--amber)">${fmtMoney(m.pend)}</td>
                <td style="font-family:var(--font-mono);color:var(--red)">${fmtMoney(m.atr)}</td>
                <td style="font-family:var(--font-mono)">${fmtMoney(aberto)}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="flex:1;height:5px;background:var(--bg-elevated);border-radius:99px;overflow:hidden;min-width:60px">
                      <div style="height:100%;width:${pct}%;background:${pctColor};border-radius:99px"></div>
                    </div>
                    <span style="font-size:11.5px;color:${pctColor};font-weight:600;white-space:nowrap">${pct}%</span>
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
// ABA 3 — INADIMPLÊNCIA (AGING)
// ══════════════════════════════════════════════════════════════

function renderAbaInadimplencia(container) {
  const hoje = new Date();

  // Buckets de aging
  const buckets = [
    { label: '1–30 dias',   min: 1,   max: 30,  color: 'var(--amber)', items: [] },
    { label: '31–60 dias',  min: 31,  max: 60,  color: 'var(--orange, #f97316)', items: [] },
    { label: '61–90 dias',  min: 61,  max: 90,  color: 'var(--red)', items: [] },
    { label: '+ de 90 dias',min: 91,  max: 9999,color: '#b91c1c', items: [] },
  ];

  _pagamentos
    .filter(p => p.status === 'atraso' && p.data_vencimento)
    .forEach(p => {
      const dias = Math.floor((hoje - new Date(p.data_vencimento)) / 86400000);
      const b = buckets.find(b => dias >= b.min && dias <= b.max);
      if (b) b.items.push({ ...p, dias });
    });

  const totalAtr  = buckets.reduce((s, b) => s + b.items.reduce((a, p) => a + Number(p.valor), 0), 0);
  const qtdAtr    = buckets.reduce((s, b) => s + b.items.length, 0);

  container.innerHTML = `
    <!-- Cards de resumo por bucket -->
    <div class="stats-row" style="margin-bottom:20px">
      ${buckets.map(b => {
        const tot = b.items.reduce((a, p) => a + Number(p.valor), 0);
        return `
        <div class="stat-card">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
            <span style="width:8px;height:8px;border-radius:50%;background:${b.color};flex-shrink:0;display:inline-block"></span>
            <span class="stat-label">${b.label}</span>
          </div>
          <div class="stat-value" style="color:${b.color}">${fmtMoney(tot)}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${b.items.length} cobrança${b.items.length !== 1 ? 's' : ''}</div>
        </div>`;
      }).join('')}
    </div>

    <!-- Barra de distribuição -->
    ${totalAtr > 0 ? `
    <div class="card" style="padding:16px 20px;margin-bottom:20px">
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:10px">Distribuição do atraso — ${fmtMoney(totalAtr)} total (${qtdAtr} cobranças)</div>
      <div style="display:flex;height:12px;border-radius:99px;overflow:hidden;gap:1px">
        ${buckets.map(b => {
          const pct = totalAtr > 0 ? (b.items.reduce((a, p) => a + Number(p.valor), 0) / totalAtr * 100) : 0;
          return pct > 0 ? `<div style="width:${pct.toFixed(1)}%;background:${b.color};opacity:.85" title="${b.label}: ${pct.toFixed(0)}%"></div>` : '';
        }).join('')}
      </div>
      <div style="display:flex;gap:14px;margin-top:8px;font-size:11px;color:var(--text-secondary);flex-wrap:wrap">
        ${buckets.map(b => {
          const pct = totalAtr > 0 ? Math.round(b.items.reduce((a, p) => a + Number(p.valor), 0) / totalAtr * 100) : 0;
          return `<span style="display:flex;align-items:center;gap:4px">
            <span style="width:8px;height:8px;border-radius:50%;background:${b.color};display:inline-block"></span>
            ${b.label} ${pct}%</span>`;
        }).join('')}
      </div>
    </div>` : ''}

    <!-- Tabelas por bucket -->
    ${buckets.map(b => {
      if (!b.items.length) return '';
      return `
      <div class="card" style="margin-bottom:16px">
        <div style="padding:14px 20px 0;display:flex;align-items:center;gap:10px">
          <span style="width:10px;height:10px;border-radius:50%;background:${b.color};display:inline-block;flex-shrink:0"></span>
          <span style="font-size:13px;font-weight:600">${b.label}</span>
          <span style="font-size:11.5px;color:var(--text-tertiary);margin-left:auto">
            ${b.items.length} cobranças · ${fmtMoney(b.items.reduce((a, p) => a + Number(p.valor), 0))}
          </span>
        </div>
        <div style="overflow-x:auto;padding:8px 0 4px">
          <table>
            <thead><tr><th>Aluno</th><th>Curso</th><th>Valor</th><th>Vencimento</th><th>Dias</th><th>Ações</th></tr></thead>
            <tbody>
              ${b.items.sort((a, x) => x.dias - a.dias).map(p => `
              <tr>
                <td style="font-weight:500;font-size:13px">${esc(p.aluno_nome)}</td>
                <td style="font-size:12px;color:var(--text-secondary)">${esc(p.curso_nome)}</td>
                <td style="font-family:var(--font-mono);font-weight:600">${fmtMoney(p.valor)}</td>
                <td style="font-size:12.5px">${fmtDate(p.data_vencimento)}</td>
                <td>
                  <span style="font-family:var(--font-mono);font-size:12px;color:${b.color};font-weight:600">${p.dias}d</span>
                </td>
                <td>
                  <button class="action-btn action-confirmar-inad" data-id="${p.id}"
                    style="color:var(--green);border-color:var(--green)">Confirmar</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    }).join('')}

    ${qtdAtr === 0 ? `
    <div style="text-align:center;padding:60px 20px;color:var(--text-tertiary)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"
           style="opacity:.3;display:block;margin:0 auto 12px">
        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <div style="font-size:14px;font-weight:500">Nenhuma inadimplência registrada</div>
      <div style="font-size:12px;margin-top:4px">Todos os pagamentos estão em dia.</div>
    </div>` : ''}
  `;

  document.querySelectorAll('.action-confirmar-inad').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = _pagamentos.find(x => x.id === btn.dataset.id);
      if (p) modalConfirmarPagamento(p);
    });
  });
}

// ══════════════════════════════════════════════════════════════
// MODAIS
// ══════════════════════════════════════════════════════════════

function modalConfirmarPagamento(pag) {
  const hoje = new Date().toISOString().split('T')[0];

  openModal('Confirmar Recebimento', `
    <div style="background:var(--bg-elevated);border-radius:8px;padding:14px 16px;margin-bottom:16px;border:1px solid var(--border-subtle)">
      <div style="font-weight:600;font-size:13.5px">${esc(pag.aluno_nome)}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${esc(pag.curso_nome)}</div>
      <div style="display:flex;gap:20px;margin-top:10px;font-family:var(--font-mono);font-size:12.5px">
        <span style="font-weight:600">${fmtMoney(pag.valor)}</span>
        <span style="color:var(--text-tertiary)">Venc. ${pag.data_vencimento ? fmtDate(pag.data_vencimento) : '—'}</span>
        ${pag.status === 'atraso'
          ? `<span style="color:var(--red)">${Math.floor((new Date(hoje) - new Date(pag.data_vencimento)) / 86400000)}d em atraso</span>`
          : ''}
      </div>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Data do Recebimento <span style="color:var(--red)">*</span></label>
        <input id="f-data-pag" type="text" class="dp-input" placeholder="Selecione a data" readonly value="${hoje}">
      </div>
      <div class="form-group">
        <label>Forma de Pagamento</label>
        <select id="f-tipo-conf">
          <option value="pix"            ${pag.tipo_pagamento==='pix'?'selected':''}>PIX</option>
          <option value="boleto"         ${pag.tipo_pagamento==='boleto'?'selected':''}>Boleto</option>
          <option value="cartao_credito" ${pag.tipo_pagamento==='cartao_credito'?'selected':''}>Cartão Crédito</option>
          <option value="cartao_debito"  ${pag.tipo_pagamento==='cartao_debito'?'selected':''}>Cartão Débito</option>
          <option value="transferencia"  ${pag.tipo_pagamento==='transferencia'?'selected':''}>Transferência</option>
          <option value="dinheiro"       ${pag.tipo_pagamento==='dinheiro'?'selected':''}>Dinheiro</option>
        </select>
      </div>
      <div class="form-group full">
        <label>Comprovante de Pagamento</label>
        <div id="drop-zone" style="border:1.5px dashed var(--border-default);border-radius:8px;padding:20px;
             text-align:center;cursor:pointer;transition:border-color .2s,background .2s">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"
               style="color:var(--text-tertiary);margin-bottom:8px;display:block;margin:0 auto 8px">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <div style="font-size:12.5px;color:var(--text-secondary)">Arraste ou clique para selecionar</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">PDF, PNG, JPG — até 5 MB</div>
          <input type="file" id="f-comprovante" accept="image/*,.pdf" style="display:none">
        </div>
        <div id="comp-preview" style="display:none;margin-top:8px;padding:8px 12px;
             background:var(--accent-soft);border-radius:6px;font-size:12px;color:var(--accent);
             display:none;align-items:center;gap:6px"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">Confirmar Recebimento</button>
    </div>
  `);

  const dz  = document.getElementById('drop-zone');
  const inp = document.getElementById('f-comprovante');
  dz?.addEventListener('click', () => inp?.click());
  dz?.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; dz.style.background = 'var(--accent-soft)'; });
  dz?.addEventListener('dragleave', () => { dz.style.borderColor = 'var(--border-default)'; dz.style.background = ''; });
  dz?.addEventListener('drop', e => {
    e.preventDefault();
    dz.style.borderColor = 'var(--border-default)'; dz.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file) { setDropFile(inp, file); showCompPreview(file); }
  });
  inp?.addEventListener('change', e => { if (e.target.files[0]) showCompPreview(e.target.files[0]); });

  // Date picker
  initDatePicker(document.getElementById('f-data-pag'));

  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-save')?.addEventListener('click',   () => confirmarPagamento(pag));
}

function setDropFile(input, file) {
  try { const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; } catch (_) {}
}

function showCompPreview(file) {
  const preview = document.getElementById('comp-preview');
  if (!preview) return;
  preview.style.display = 'flex';
  preview.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
    <span>${esc(file.name)} · ${(file.size / 1024).toFixed(0)} KB</span>`;
}

async function confirmarPagamento(pag) {
  const btn    = document.getElementById('modal-save');
  btn.disabled = true; btn.textContent = 'Processando...';

  const dataPag = document.getElementById('f-data-pag')?.value || new Date().toISOString().split('T')[0];
  const tipoPag = document.getElementById('f-tipo-conf')?.value || pag.tipo_pagamento;
  const file    = document.getElementById('f-comprovante')?.files?.[0] ?? null;

  try {
    let comprovante_url = pag.comprovante_url ?? null;

    if (file) {
      btn.textContent = 'Enviando comprovante...';
      if (file.size > 5 * 1024 * 1024) throw new Error('Arquivo muito grande. Máximo 5 MB.');
      const ext  = file.name.split('.').pop().toLowerCase();
      const path = `${getTenantId()}/${pag.id}/comprovante.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('comprovantes')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw new Error(`Upload falhou: ${upErr.message}`);
      comprovante_url = path;
    }

    btn.textContent = 'Confirmando...';
    const { error } = await supabase.from('pagamentos')
      .update({
        status:         'recebido',
        data_pagamento: dataPag,
        tipo_pagamento: tipoPag,
        ...(comprovante_url !== null && { comprovante_url }),
      })
      .eq('id', pag.id)
      .eq('tenant_id', getTenantId());
    if (error) throw error;

    closeModal();
    toast('Recebimento confirmado!', 'success');
    await loadData();
    setAba(_abaAtiva);
  } catch (e) {
    toast(`Erro: ${e.message}`, 'error');
    btn.disabled = false; btn.textContent = 'Confirmar Recebimento';
  }
}

async function verComprovante(storagePath) {
  try {
    const { data, error } = await supabase.storage.from('comprovantes').createSignedUrl(storagePath, 3600);
    if (error) throw error;
    window.open(data.signedUrl, '_blank', 'noopener');
  } catch (_) {
    toast('Não foi possível abrir o comprovante.', 'error');
  }
}

async function gerarReciboPDF(pag) {
  toast('Gerando recibo...', 'info');
  try {
    if (typeof window.jspdf === 'undefined') {
      await new Promise(resolve => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = resolve; document.head.appendChild(s);
      });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ format: 'a5', orientation: 'portrait' });
    const W   = doc.internal.pageSize.getWidth();

    doc.setFillColor(10, 12, 18);
    doc.rect(0, 0, W, 32, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(99, 255, 171);
    doc.text('RECIBO DE PAGAMENTO', W / 2, 14, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(130, 140, 160);
    doc.text('EduOS — Sistema de Gestão Educacional', W / 2, 23, { align: 'center' });

    const recNum = pag.recibo || `REC-${pag.id.substring(0, 8).toUpperCase()}`;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Recibo Nº ${recNum}`, 14, 44);
    doc.setDrawColor(220, 220, 220);
    doc.line(14, 47, W - 14, 47);

    const rows = [
      ['Aluno',           pag.aluno_nome],
      ['Curso',           pag.curso_nome],
      ['Valor Pago',      fmtMoney(pag.valor)],
      ['Data Pagamento',  pag.data_pagamento  ? fmtDate(pag.data_pagamento)  : '—'],
      ['Data Vencimento', pag.data_vencimento ? fmtDate(pag.data_vencimento) : '—'],
      ['Forma Pagamento', TIPO_LABEL[pag.tipo_pagamento] ?? pag.tipo_pagamento ?? '—'],
    ];
    let y = 56;
    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');   doc.setFontSize(8.5); doc.setTextColor(120, 120, 120);
      doc.text(label + ':', 14, y);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 30, 30);
      doc.text(String(value || '—'), 58, y);
      y += 9;
    });

    doc.setDrawColor(220, 220, 220);
    doc.line(14, y + 8, W - 14, y + 8);
    doc.setFontSize(7.5); doc.setTextColor(160, 160, 160);
    doc.text(`Emitido em ${new Date().toLocaleDateString('pt-BR')} via EduOS`, W / 2, y + 16, { align: 'center' });
    doc.save(`recibo-${recNum}.pdf`);
    toast('Recibo gerado!', 'success');
  } catch (e) {
    toast('Erro ao gerar recibo.', 'error');
  }
}

function modalPagamento(pag = null) {
  const isEdit  = !!pag;
  const matOpts = _matriculas.map(m =>
    `<option value="${m.id}" data-alu="${m.aluno?.id}" data-cur="${m.curso?.id}"
      ${pag?.matricula_id === m.id ? 'selected' : ''}>
      ${esc(m.aluno?.nome ?? '?')} — ${esc(m.curso?.nome ?? '?')}
    </option>`
  ).join('');

  openModal(isEdit ? 'Editar Cobrança' : 'Registrar Cobrança', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Matrícula associada <span style="color:var(--red)">*</span></label>
        <select id="f-matricula">
          <option value="">— Selecione —</option>
          ${matOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Valor (R$) <span style="color:var(--red)">*</span></label>
        <input id="f-valor" type="number" step="0.01" min="0.01" value="${pag?.valor || ''}" placeholder="0,00">
        <div id="hint-valor" style="display:none;font-size:11px;color:var(--accent);margin-top:3px;display:flex;align-items:center;gap:4px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><polyline points="20 6 9 17 4 12"/></svg>
          <span id="hint-valor-text"></span>
        </div>
      </div>
      <div class="form-group">
        <label>Vencimento <span style="color:var(--red)">*</span></label>
        <input id="f-venc" type="text" class="dp-input" placeholder="Selecione a data" readonly value="${pag?.data_vencimento || ''}">
        <div id="hint-venc" style="display:none;font-size:11px;color:var(--accent);margin-top:3px;display:flex;align-items:center;gap:4px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="10" height="10"><polyline points="20 6 9 17 4 12"/></svg>
          <span id="hint-venc-text"></span>
        </div>
      </div>
      <div class="form-group">
        <label>Forma de Pagamento</label>
        <select id="f-tipo">
          ${['pix','boleto','cartao_credito','cartao_debito','transferencia','dinheiro','cheque'].map(v =>
            `<option value="${v}" ${pag?.tipo_pagamento === v ? 'selected' : ''}>${TIPO_LABEL[v] ?? v}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="f-status">
          ${['pendente','recebido','atraso','cancelado','isento'].map(v =>
            `<option value="${v}" ${pag?.status === v ? 'selected' : ''}>${STATUS_LABEL[v]}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group full">
        <label>Número do Recibo</label>
        <input id="f-recibo" type="text" value="${esc(pag?.recibo || '')}" placeholder="Ex: REC-0001">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Salvar Alterações' : 'Registrar Cobrança'}</button>
    </div>
  `);

  // Date picker
  initDatePicker(document.getElementById('f-venc'));

  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-save')?.addEventListener('click',   () => savePagamento(pag?.id));

  // Auto-preenchimento de valor e vencimento ao selecionar matrícula
  if (!isEdit) {
    document.getElementById('f-matricula')?.addEventListener('change', function () {
      const mat        = _matriculas.find(m => m.id === this.value);
      const valorInput = document.getElementById('f-valor');
      const vencInput  = document.getElementById('f-venc');
      const hintValor  = document.getElementById('hint-valor');
      const hintVenc   = document.getElementById('hint-venc');

      // Limpa hints anteriores
      if (hintValor) hintValor.style.display = 'none';
      if (hintVenc)  hintVenc.style.display  = 'none';

      if (!mat) return;

      // Valor do curso
      if (mat.curso?.valor_padrao) {
        valorInput.value = mat.curso.valor_padrao;
        if (hintValor) {
          hintValor.style.display = 'flex';
          document.getElementById('hint-valor-text').textContent =
            `Valor padrão do curso (${fmtMoney(mat.curso.valor_padrao)})`;
        }
      }

      // Vencimento = data_inicio da turma, se houver; senão +30 dias
      if (mat.turma?.data_inicio) {
        vencInput.value = mat.turma.data_inicio;
        if (hintVenc) {
          hintVenc.style.display = 'flex';
          document.getElementById('hint-venc-text').textContent =
            `Data de início da turma`;
        }
      } else {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        vencInput.value = d.toISOString().split('T')[0];
        if (hintVenc) {
          hintVenc.style.display = 'flex';
          document.getElementById('hint-venc-text').textContent =
            `Sem turma definida — vencimento em 30 dias`;
        }
      }
    });
  }
}

async function savePagamento(id) {
  const selMat       = document.getElementById('f-matricula');
  const matricula_id = selMat.value || null;
  const aluno_id     = selMat.options[selMat.selectedIndex]?.dataset.alu || null;
  const curso_id     = selMat.options[selMat.selectedIndex]?.dataset.cur || null;
  const valor        = parseFloat(document.getElementById('f-valor').value) || null;
  const data_vencimento = document.getElementById('f-venc').value    || null;
  const tipo_pagamento  = document.getElementById('f-tipo').value;
  const status          = document.getElementById('f-status').value;
  const recibo          = document.getElementById('f-recibo').value.trim() || null;

  const ok = validateForm([
    { id: 'f-matricula', value: matricula_id ?? '',    rules: ['required'],            label: 'Matrícula' },
    { id: 'f-valor',     value: String(valor ?? ''),   rules: ['required','positive'],  label: 'Valor' },
    { id: 'f-venc',      value: data_vencimento ?? '', rules: ['required'],             label: 'Vencimento' },
  ]);
  if (!ok) return;

  const payload = { tenant_id: getTenantId(), matricula_id, aluno_id, curso_id, valor, data_vencimento, tipo_pagamento, status, recibo };
  if (status === 'recebido' && !id) payload.data_pagamento = new Date().toISOString().split('T')[0];

  const btn = document.getElementById('modal-save');
  btn.disabled = true; btn.textContent = 'Salvando...';

  try {
    let error;
    if (id) {
      ({ error } = await supabase.from('pagamentos').update(payload).eq('id', id).eq('tenant_id', getTenantId()));
    } else {
      ({ error } = await supabase.from('pagamentos').insert(payload));
    }
    if (error) throw error;
    closeModal();
    toast(id ? 'Cobrança atualizada!' : 'Cobrança registrada!', 'success');
    await loadData();
    setAba(_abaAtiva);
  } catch (e) {
    toast(`Erro: ${e.message}`, 'error');
    btn.disabled = false;
    btn.textContent = id ? 'Salvar Alterações' : 'Registrar Cobrança';
  }
}

function exportarCSV() {
  const headers = ['Aluno','Curso','Valor','Vencimento','Pago em','Tipo','Status','Recibo'];
  const rows = _pagamentos.map(p => [
    p.aluno_nome, p.curso_nome, p.valor, p.data_vencimento,
    p.data_pagamento || '', p.tipo_pagamento || '', p.status, p.recibo || ''
  ].map(v => `"${v ?? ''}"`).join(','));
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `financeiro-${new Date().toISOString().split('T')[0]}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado!', 'success');
}
