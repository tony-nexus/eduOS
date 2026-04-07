/**
 * /js/views/financeiro.js
 * Gestão financeira: cobranças, recebimentos, inadimplência e comprovantes.
 *
 * MELHORIAS:
 *  - KPIs: total em aberto, recebido, pendente, atraso, taxa de inadimplência
 *  - Filtros: status, tipo de pagamento, curso, intervalo de vencimento
 *  - Coluna "Pago em" e "Dias em atraso" inline
 *  - Modal de confirmação com upload de comprovante (Supabase Storage)
 *  - Visualização do comprovante via signed URL
 *  - Geração de recibo em PDF (jsPDF)
 *  - Exportação CSV
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast, fmtMoney, fmtDate, esc } from '../ui/components.js';
import { validateForm } from '../ui/validate.js';
import { autoEmitirCertificados } from '../core/automations.js';

let _pagamentos = [];
let _matriculas = [];

const STATUS_LABEL = { pendente:'Pendente', recebido:'Recebido', atraso:'Em Atraso', cancelado:'Cancelado', isento:'Isento' };
const STATUS_BADGE = { pendente:'badge-amber', recebido:'badge-green', atraso:'badge-red', cancelado:'badge-gray', isento:'badge-purple' };
const TIPO_LABEL   = { pix:'PIX', boleto:'Boleto', cartao_credito:'Cartão Crédito', cartao_debito:'Cartão Débito', dinheiro:'Dinheiro' };

// ─── Render principal ─────────────────────────────────────────────────────────
export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Financeiro</h1><p>Cobranças, recebimentos e inadimplência</p></div>
      <div class="page-header-actions">
        <button class="btn btn-secondary" id="btn-exportar-fin">Exportar CSV</button>
        <button class="btn btn-primary" id="btn-registrar-pag">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Registrar Cobrança
        </button>
      </div>
    </div>

    <div class="stats-row" id="fin-kpis">
      ${Array(5).fill('<div class="stat-card"><div class="skeleton" style="height:44px;width:100%"></div></div>').join('')}
    </div>

    <div class="table-wrap">
      <div class="table-toolbar" style="flex-wrap:wrap;gap:8px">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-fin" placeholder="Buscar aluno ou recibo...">
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
        </select>
        <select class="select-input" id="filtro-curso-fin">
          <option value="">Todos os cursos</option>
        </select>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-size:11.5px;color:var(--text-tertiary);white-space:nowrap">Venc. de</span>
          <input type="date" class="select-input" id="filtro-data-de" style="width:auto">
          <span style="font-size:11.5px;color:var(--text-tertiary)">até</span>
          <input type="date" class="select-input" id="filtro-data-ate" style="width:auto">
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
          <tbody id="fin-tbody">
            <tr><td colspan="9" style="text-align:center;padding:40px">
              <div class="skeleton" style="width:16px;height:16px;border-radius:50%;display:inline-block"></div> Carregando...
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `);

  document.getElementById('btn-registrar-pag')?.addEventListener('click', () => modalPagamento());
  document.getElementById('btn-exportar-fin')?.addEventListener('click', exportarCSV);
  ['search-fin','filtro-status-fin','filtro-tipo-fin','filtro-curso-fin','filtro-data-de','filtro-data-ate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('input', applyFilter); el.addEventListener('change', applyFilter); }
  });

  await Promise.all([loadData(), loadAux()]);

  const cursos = [...new Map(_matriculas.map(m => [m.curso?.id, m.curso])).values()].filter(Boolean);
  const fCurso = document.getElementById('filtro-curso-fin');
  if (fCurso) cursos.forEach(c => fCurso.innerHTML += `<option value="${c.id}">${esc(c.nome)}</option>`);
}

// ─── Fetches ──────────────────────────────────────────────────────────────────
async function loadAux() {
  try {
    const { data } = await supabase
      .from('matriculas')
      .select('id, aluno:aluno_id(id, nome), curso:curso_id(id, nome)')
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
  applyFilter();
}

async function autoMarkAtrasados() {
  const hoje = new Date().toISOString().split('T')[0];
  try {
    const { error } = await supabase.from('pagamentos')
      .update({ status: 'atraso' })
      .eq('tenant_id', getTenantId())
      .eq('status', 'pendente')
      .lt('data_vencimento', hoje);
    if (error) throw error;
  } catch (e) {
    console.warn('[Financeiro] autoMarkAtrasados:', e.message);
  }
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function renderKPIs(pags) {
  let recebido = 0, pendente = 0, atraso = 0;
  let qtdRecebido = 0, qtdPendente = 0, qtdAtraso = 0;

  pags.forEach(p => {
    const v = Number(p.valor) || 0;
    if (p.status === 'recebido')      { recebido  += v; qtdRecebido++; }
    else if (p.status === 'pendente') { pendente  += v; qtdPendente++; }
    else if (p.status === 'atraso')   { atraso    += v; qtdAtraso++;   }
  });

  const emAberto      = pendente + atraso;
  const inadimplencia = emAberto > 0 ? Math.round(atraso / emAberto * 100) : 0;
  const inadColor     = inadimplencia > 20 ? 'var(--red)' : inadimplencia > 10 ? 'var(--amber)' : 'var(--green)';

  const el = document.getElementById('fin-kpis');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Em Aberto</div>
      <div class="stat-value" style="color:var(--text-primary)">${fmtMoney(emAberto)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${qtdPendente + qtdAtraso} cobranças</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Recebido</div>
      <div class="stat-value" style="color:var(--green)">${fmtMoney(recebido)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${qtdRecebido} pagamentos</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Pendente</div>
      <div class="stat-value" style="color:var(--amber)">${fmtMoney(pendente)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${qtdPendente} cobranças</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Em Atraso</div>
      <div class="stat-value" style="color:var(--red)">${fmtMoney(atraso)}</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">${qtdAtraso} cobranças</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Inadimplência</div>
      <div class="stat-value" style="color:${inadColor}">${inadimplencia}%</div>
      <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">do valor em aberto</div>
    </div>
  `;
}

// ─── Filtro / tabela ──────────────────────────────────────────────────────────
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
      ? Math.floor((new Date(hoje) - new Date(p.data_vencimento)) / 86400000)
      : 0;

    const temComp = !!p.comprovante_url;

    return `
    <tr>
      <td>
        <div style="font-weight:500;font-size:13px">${esc(p.aluno_nome)}</div>
        ${p.recibo ? `<div style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-tertiary)">${esc(p.recibo)}</div>` : ''}
      </td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${esc(p.curso_nome)}</td>
      <td style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--green)">${fmtMoney(p.valor || 0)}</td>
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
        ${temComp
          ? `<button class="action-btn btn-ver-comp" data-path="${esc(p.comprovante_url)}" title="Ver comprovante"
               style="color:var(--accent);border-color:var(--accent);padding:3px 8px;display:inline-flex;align-items:center;gap:4px">
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
               Ver
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
            ? `<button class="action-btn btn-recibo-pdf" data-id="${p.id}">Recibo</button>`
            : ''}
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

// ─── Modal: Confirmar Recebimento ─────────────────────────────────────────────
function modalConfirmarPagamento(pag) {
  const hoje = new Date().toISOString().split('T')[0];

  openModal('Confirmar Recebimento', `
    <div style="background:var(--bg-elevated);border-radius:8px;padding:14px 16px;margin-bottom:16px;border:1px solid var(--border-subtle)">
      <div style="font-weight:600;font-size:13.5px">${esc(pag.aluno_nome)}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${esc(pag.curso_nome)}</div>
      <div style="display:flex;gap:20px;margin-top:10px;font-family:var(--font-mono);font-size:12.5px">
        <span style="color:var(--green);font-weight:600">${fmtMoney(pag.valor)}</span>
        <span style="color:var(--text-tertiary)">Venc. ${pag.data_vencimento ? fmtDate(pag.data_vencimento) : '—'}</span>
      </div>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Data do Recebimento *</label>
        <input id="f-data-pag" type="date" value="${hoje}">
      </div>
      <div class="form-group">
        <label>Forma de Pagamento</label>
        <select id="f-tipo-conf">
          <option value="pix"           ${pag.tipo_pagamento==='pix'?'selected':''}>PIX</option>
          <option value="boleto"        ${pag.tipo_pagamento==='boleto'?'selected':''}>Boleto</option>
          <option value="cartao_credito"${pag.tipo_pagamento==='cartao_credito'?'selected':''}>Cartão Crédito</option>
          <option value="cartao_debito" ${pag.tipo_pagamento==='cartao_debito'?'selected':''}>Cartão Débito</option>
          <option value="dinheiro"      ${pag.tipo_pagamento==='dinheiro'?'selected':''}>Dinheiro</option>
        </select>
      </div>
      <div class="form-group full">
        <label>Comprovante de Pagamento</label>
        <div id="drop-zone" style="border:1.5px dashed var(--border);border-radius:8px;padding:20px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"
               style="color:var(--text-tertiary);margin-bottom:8px;display:block;margin-left:auto;margin-right:auto">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <div style="font-size:12.5px;color:var(--text-secondary)">Arraste ou clique para selecionar</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:4px">PDF, PNG, JPG — até 5 MB</div>
          <input type="file" id="f-comprovante" accept="image/*,.pdf" style="display:none">
        </div>
        <div id="comp-preview" style="display:none;margin-top:8px;padding:8px 12px;background:var(--accent-soft);border-radius:6px;font-size:12px;color:var(--accent);display:flex;align-items:center;gap:6px"></div>
        ${pag.comprovante_url
          ? `<div style="margin-top:6px;font-size:11px;color:var(--amber)">
               Já existe um comprovante anexado. O upload substituirá o anterior.
             </div>`
          : ''}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">Confirmar Recebimento</button>
    </div>
  `);

  // Drop zone interactivity
  const dz  = document.getElementById('drop-zone');
  const inp = document.getElementById('f-comprovante');

  dz?.addEventListener('click', () => inp?.click());
  dz?.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; dz.style.background = 'var(--accent-soft)'; });
  dz?.addEventListener('dragleave', () => { dz.style.borderColor = 'var(--border)'; dz.style.background = ''; });
  dz?.addEventListener('drop', e => {
    e.preventDefault();
    dz.style.borderColor = 'var(--border)'; dz.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file) { setDropFile(inp, file); showCompPreview(file); }
  });
  inp?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) showCompPreview(file);
  });

  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-save')?.addEventListener('click', () => confirmarPagamento(pag));
}

function setDropFile(input, file) {
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  } catch (_) {}
}

function showCompPreview(file) {
  const preview = document.getElementById('comp-preview');
  if (!preview) return;
  preview.style.display = 'flex';
  preview.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
    <span>${esc(file.name)} &nbsp;·&nbsp; ${(file.size / 1024).toFixed(0)} KB</span>
  `;
}

async function confirmarPagamento(pag) {
  const btn     = document.getElementById('modal-save');
  btn.disabled  = true; btn.textContent = 'Processando...';

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
    const payload = {
      status:         'recebido',
      data_pagamento: dataPag,
      tipo_pagamento: tipoPag,
      ...(comprovante_url !== null && { comprovante_url }),
    };

    const { error } = await supabase.from('pagamentos')
      .update(payload)
      .eq('id', pag.id)
      .eq('tenant_id', getTenantId());
    if (error) throw error;

    if (pag.matricula_id) {
      await supabase.from('matriculas')
        .update({ status: 'concluido' })
        .eq('id', pag.matricula_id)
        .eq('tenant_id', getTenantId())
        .in('status', ['matriculado', 'aguardando_turma', 'em_andamento']);

      const certCount = await autoEmitirCertificados();
      closeModal();
      toast(certCount > 0
        ? 'Recebimento confirmado! Certificado emitido automaticamente.'
        : 'Recebimento confirmado! Aluno avançado no pipeline.',
        'success');
    } else {
      closeModal();
      toast('Recebimento confirmado!', 'success');
    }

    await loadData();
  } catch (e) {
    console.error(e);
    toast(`Erro: ${e.message}`, 'error');
    btn.disabled = false; btn.textContent = 'Confirmar Recebimento';
  }
}

// ─── Ver comprovante (signed URL) ─────────────────────────────────────────────
async function verComprovante(storagePath) {
  try {
    const { data, error } = await supabase.storage
      .from('comprovantes')
      .createSignedUrl(storagePath, 3600);
    if (error) throw error;
    window.open(data.signedUrl, '_blank', 'noopener');
  } catch (_) {
    toast('Não foi possível abrir o comprovante.', 'error');
  }
}

// ─── Recibo PDF ───────────────────────────────────────────────────────────────
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

    // Header
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

    // Recibo number
    const recNum = pag.recibo || `REC-${pag.id.substring(0, 8).toUpperCase()}`;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Recibo Nº ${recNum}`, 14, 44);
    doc.setDrawColor(220, 220, 220);
    doc.line(14, 47, W - 14, 47);

    // Fields
    const rows = [
      ['Aluno',            pag.aluno_nome],
      ['Curso',            pag.curso_nome],
      ['Valor Pago',       fmtMoney(pag.valor)],
      ['Data Pagamento',   pag.data_pagamento  ? fmtDate(pag.data_pagamento)  : '—'],
      ['Data Vencimento',  pag.data_vencimento ? fmtDate(pag.data_vencimento) : '—'],
      ['Forma Pagamento',  TIPO_LABEL[pag.tipo_pagamento] ?? pag.tipo_pagamento ?? '—'],
    ];

    let y = 56;
    rows.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(120, 120, 120);
      doc.text(label + ':', 14, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      doc.text(String(value || '—'), 58, y);
      y += 9;
    });

    // Footer
    doc.setDrawColor(220, 220, 220);
    doc.line(14, y + 8, W - 14, y + 8);
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    doc.text(`Emitido automaticamente em ${new Date().toLocaleDateString('pt-BR')} via EduOS`, W / 2, y + 16, { align: 'center' });

    doc.save(`recibo-${recNum}.pdf`);
    toast('Recibo gerado com sucesso!', 'success');
  } catch (e) {
    console.error(e);
    toast('Erro ao gerar recibo.', 'error');
  }
}

// ─── Modal Registro / Edição ──────────────────────────────────────────────────
function modalPagamento(pag = null) {
  const isEdit  = !!pag;
  const matOpts = _matriculas.map(m =>
    `<option value="${m.id}" data-alu="${m.aluno?.id}" data-cur="${m.curso?.id}"
      ${pag?.matricula_id == m.id ? 'selected' : ''}>
      ${esc(m.aluno?.nome)} — ${esc(m.curso?.nome)}
    </option>`
  ).join('');

  openModal(isEdit ? 'Editar Cobrança' : 'Registrar Cobrança', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Matrícula associada *</label>
        <select id="f-matricula">
          <option value="">— Selecione a Matrícula —</option>
          ${matOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Valor (R$) *</label>
        <input id="f-valor" type="number" step="0.01" min="0.01" value="${pag?.valor || ''}" placeholder="0,00">
      </div>
      <div class="form-group">
        <label>Vencimento *</label>
        <input id="f-venc" type="date" value="${pag?.data_vencimento || ''}">
      </div>
      <div class="form-group">
        <label>Forma de Pagamento</label>
        <select id="f-tipo">
          <option value="pix"           ${pag?.tipo_pagamento==='pix'?'selected':''}>PIX</option>
          <option value="boleto"        ${pag?.tipo_pagamento==='boleto'?'selected':''}>Boleto</option>
          <option value="cartao_credito"${pag?.tipo_pagamento==='cartao_credito'?'selected':''}>Cartão Crédito</option>
          <option value="cartao_debito" ${pag?.tipo_pagamento==='cartao_debito'?'selected':''}>Cartão Débito</option>
          <option value="dinheiro"      ${pag?.tipo_pagamento==='dinheiro'?'selected':''}>Dinheiro</option>
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="f-status">
          <option value="pendente" ${pag?.status==='pendente'?'selected':''}>Pendente</option>
          <option value="recebido" ${pag?.status==='recebido'?'selected':''}>Recebido</option>
          <option value="atraso"   ${pag?.status==='atraso'?'selected':''}>Atrasado</option>
          <option value="cancelado"${pag?.status==='cancelado'?'selected':''}>Cancelado</option>
          <option value="isento"   ${pag?.status==='isento'?'selected':''}>Isento</option>
        </select>
      </div>
      <div class="form-group full">
        <label>Número do Recibo (opcional)</label>
        <input id="f-recibo" type="text" value="${esc(pag?.recibo || '')}" placeholder="Ex: REC-0001">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? 'Salvar Alterações' : 'Registrar Cobrança'}</button>
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-save')?.addEventListener('click', () => savePagamento(pag?.id));
}

async function savePagamento(id) {
  const selMat      = document.getElementById('f-matricula');
  const matricula_id = selMat.value || null;
  const aluno_id    = selMat.options[selMat.selectedIndex]?.dataset.alu || null;
  const curso_id    = selMat.options[selMat.selectedIndex]?.dataset.cur || null;
  const valor       = parseFloat(document.getElementById('f-valor').value) || null;
  const data_vencimento = document.getElementById('f-venc').value || null;
  const tipo_pagamento  = document.getElementById('f-tipo').value;
  const status      = document.getElementById('f-status').value;
  const recibo      = document.getElementById('f-recibo').value.trim() || null;

  const ok = validateForm([
    { id: 'f-matricula', value: matricula_id ?? '',    rules: ['required'],           label: 'Matrícula' },
    { id: 'f-valor',     value: String(valor ?? ''),   rules: ['required','positive'], label: 'Valor' },
    { id: 'f-venc',      value: data_vencimento ?? '', rules: ['required'],           label: 'Vencimento' },
  ]);
  if (!ok) return;

  const payload = { tenant_id: getTenantId(), matricula_id, aluno_id, curso_id, valor, data_vencimento, tipo_pagamento, status, recibo };
  if (status === 'recebido') payload.data_pagamento = new Date().toISOString().split('T')[0];

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
  } catch (e) {
    toast(`Erro: ${e.message}`, 'error');
    btn.disabled = false;
    btn.textContent = id ? 'Salvar Alterações' : 'Registrar Cobrança';
  }
}

// ─── Exportar CSV ─────────────────────────────────────────────────────────────
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
  a.href = url; a.download = 'financeiro.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado!', 'success');
}
