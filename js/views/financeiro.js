/**
 * /js/views/financeiro.js
 * CRUD real para Pagamentos (Financeiro).
 *
 * [FIX CRÍTICO] Ao carregar, pagamentos com status 'pendente' e vencimento
 * anterior a hoje são automaticamente marcados como 'atraso' no banco.
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast, fmtMoney, fmtDate, esc } from '../ui/components.js';
import { validateForm } from '../ui/validate.js';
import { autoEmitirCertificados } from '../core/automations.js';

let _pagamentos = [];
let _matriculas = [];

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Financeiro</h1><p>Cobranças, recebimentos e inadimplência</p></div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-registrar-pag">Registrar Pagamento</button>
      </div>
    </div>
    <div class="stats-row" id="fin-kpis">
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
    </div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-fin" placeholder="Pesquisar registro...">
        </div>
        <select class="select-input" id="filtro-curso-fin">
          <option value="">Todos os cursos</option>
        </select>
        <select class="select-input" id="filtro-status-fin">
          <option value="">Todos os status</option>
          <option value="pendente">Pendente</option>
          <option value="recebido">Recebido</option>
          <option value="atraso">Atrasado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>
      <table>
        <thead><tr><th>Aluno</th><th>Curso</th><th>Valor</th><th>Vencimento</th><th>Tipo</th><th>Recibo</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody id="fin-tbody">
          <tr><td colspan="8" style="text-align:center;padding:40px"><div class="skeleton" style="width:16px;height:16px;border-radius:50%;display:inline-block"></div> Carregando...</td></tr>
        </tbody>
      </table>
    </div>
  `);

  document.getElementById('btn-registrar-pag')?.addEventListener('click', () => modalPagamento());
  document.getElementById('search-fin')?.addEventListener('input', applyFilter);
  document.getElementById('filtro-status-fin')?.addEventListener('change', applyFilter);
  document.getElementById('filtro-curso-fin')?.addEventListener('change', applyFilter);

  await Promise.all([loadData(), loadAux()]);

  // Populando os cursos com base nas matrículas para o filtro
  const cursos = [...new Map(_matriculas.map(m => [m.curso?.id, m.curso])).values()].filter(Boolean);
  const fCurso = document.getElementById('filtro-curso-fin');
  if (fCurso) cursos.forEach(c => fCurso.innerHTML += `<option value="${c.id}">${esc(c.nome)}</option>`);
}

async function loadAux() {
  try {
    const p1 = supabase.from('matriculas').select('id, aluno:aluno_id(id, nome), curso:curso_id(id, nome)').eq('tenant_id', getTenantId());
    const [r1] = await Promise.all([p1]);
    _matriculas = r1.data || [];
  } catch (err) {
    console.error(err);
  }
}

async function loadData() {
  // [FIX CRÍTICO] Marca em atraso antes de renderizar
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
      curso_nome: p.curso?.nome || '—'
    }));
  } catch (err) {
    toast('Erro ao carregar pagamentos', 'error');
    _pagamentos = [];
  }
  
  renderKPIs(_pagamentos);
  applyFilter();
}

/**
 * Atualiza para 'atraso' todos os pagamentos 'pendente' com vencimento já passado.
 * Usa uma única UPDATE com filtros no banco — eficiente independente do volume.
 */
async function autoMarkAtrasados() {
  try {
    const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const { error } = await supabase
      .from('pagamentos')
      .update({ status: 'atraso' })
      .eq('tenant_id', getTenantId())
      .eq('status', 'pendente')
      .lt('data_vencimento', hoje);

    if (error) throw error;
  } catch (err) {
    // Não bloqueia o carregamento — só loga
    console.warn('[Financeiro] autoMarkAtrasados falhou:', err.message);
  }
}

function renderKPIs(pags) {
  let recebido = 0;
  let pendente = 0;
  let atraso = 0;
  let total = 0;
  
  pags.forEach(p => {
    total += Number(p.valor) || 0;
    if (p.status === 'recebido') recebido += Number(p.valor) || 0;
    else if (p.status === 'pendente') pendente += Number(p.valor) || 0;
    else if (p.status === 'atraso') atraso += Number(p.valor) || 0;
  });

  const el = document.getElementById('fin-kpis');
  if(!el) return;

  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Cadastrado</div><div class="stat-value" style="color:var(--text-primary)">${fmtMoney(total)}</div></div>
    <div class="stat-card"><div class="stat-label">Recebido</div><div class="stat-value" style="color:var(--green)">${fmtMoney(recebido)}</div></div>
    <div class="stat-card"><div class="stat-label">Pendente</div><div class="stat-value" style="color:var(--amber)">${fmtMoney(pendente)}</div></div>
    <div class="stat-card"><div class="stat-label">Em Atraso</div><div class="stat-value" style="color:var(--red)">${fmtMoney(atraso)}</div></div>
  `;
}

function applyFilter() {
  const q  = document.getElementById('search-fin')?.value.toLowerCase() || '';
  const st = document.getElementById('filtro-status-fin')?.value || '';
  const cr = document.getElementById('filtro-curso-fin')?.value || '';

  const f  = _pagamentos.filter(p =>
    (!q  || p.aluno_nome.toLowerCase().includes(q) || (p.recibo||'').toLowerCase().includes(q)) &&
    (!st || p.status === st) &&
    (!cr || p.curso_id === cr)
  );
  
  const tbody = document.getElementById('fin-tbody');
  if(!tbody) return;

  if(!f.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-tertiary)">Nenhum pagamento cadastrado</td></tr>`;
    return;
  }

  tbody.innerHTML = f.map(p => `
    <tr>
      <td style="font-weight:500;font-size:13px">${esc(p.aluno_nome)}</td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${esc(p.curso_nome)}</td>
      <td style="font-family:var(--font-mono);font-size:13px;color:var(--green)">${fmtMoney(p.valor||0)}</td>
      <td style="font-size:12.5px">${p.data_vencimento ? fmtDate(p.data_vencimento) : '—'}</td>
      <td><span class="badge badge-gray">${esc(p.tipo_pagamento || '—')}</span></td>
      <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-tertiary)">${esc(p.recibo||'—')}</td>
      <td><span class="badge ${p.status==='recebido'?'badge-green':p.status==='atraso'?'badge-red':p.status==='isento'?'badge-purple':'badge-amber'}">${p.status==='recebido'?'Recebido':p.status==='atraso'?'Em Atraso':p.status==='pendente'?'Pendente':p.status==='isento'?'Isento':'Cancelado'}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          ${p.status !== 'recebido' ? `<button class="action-btn action-confirmar" data-id="${p.id}">Confirmar</button>` : `<button class="action-btn" data-action="recibo">Recibo</button>`}
          <button class="action-btn action-editar" data-id="${p.id}">Editar</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.action-confirmar').forEach(btn => {
    btn.addEventListener('click', async () => await setStatus(btn.dataset.id, 'recebido'));
  });
  
  document.querySelectorAll('.action-editar').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = _pagamentos.find(x => x.id == btn.dataset.id);
      if(p) modalPagamento(p);
    });
  });

  document.querySelectorAll('.action-btn[data-action="recibo"]').forEach(btn => {
    btn.addEventListener('click', () => toast('Geração do recibo via PDF..', 'info'));
  });
}

async function setStatus(id, newStatus) {
  try {
    const payload = { status: newStatus };
    if(newStatus === 'recebido') payload.data_pagamento = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('pagamentos').update(payload).eq('id', id).eq('tenant_id', getTenantId());
    if (error) throw error;
    
    // -- AUTOMAÇÃO PIPELINE --
    if (newStatus === 'recebido') {
      const p = _pagamentos.find(x => x.id == id);
      if (p?.matricula_id) {
        // Move a matrícula para 'concluido'
        await supabase.from('matriculas')
          .update({ status: 'concluido' })
          .eq('id', p.matricula_id)
          .eq('tenant_id', getTenantId());

        // Tenta emitir certificado automaticamente (sem pendências)
        const certCount = await autoEmitirCertificados();
        if (certCount > 0) {
          toast('Pagamento recebido! Certificado emitido automaticamente.', 'success');
        } else {
          toast('Pagamento recebido! Aluno avançou para Concluído no Pipeline.', 'success');
        }
      } else {
        toast('Pagamento recebido!', 'success');
      }
    } else {
      toast('Status atualizado!', 'success');
    }
    // -- FIM AUTOMAÇÃO PIPELINE --

    await loadData();
  } catch(e) {
    toast('Erro!', 'error');
  }
}

function modalPagamento(pag = null) {
  const matOpts = _matriculas.map(m => `<option value="${m.id}" data-alu="${m.aluno?.id}" data-cur="${m.curso?.id}" ${pag?.matricula_id==m.id?'selected':''}>${m.aluno?.nome} — ${m.curso?.nome}</option>`).join('');

  openModal(pag ? 'Editar Pagamento' : 'Registrar Pagamento', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Matrícula associada *</label>
        <select id="f-matricula"><option value="">— Selecione a Matrícula —</option>${matOpts}</select>
      </div>
      <div class="form-group">
        <label>Valor (R$)</label>
        <input id="f-valor" type="number" step="0.01" value="${pag?.valor || ''}" placeholder="0.00">
      </div>
      <div class="form-group">
        <label>Vencimento</label>
        <input id="f-venc" type="date" value="${pag?.data_vencimento || ''}">
      </div>
      <div class="form-group">
        <label>Tipo</label>
        <select id="f-tipo">
          <option value="pix" ${pag?.tipo_pagamento==='pix'?'selected':''}>PIX</option>
          <option value="boleto" ${pag?.tipo_pagamento==='boleto'?'selected':''}>Boleto</option>
          <option value="cartao_credito" ${pag?.tipo_pagamento==='cartao_credito'?'selected':''}>Cartão Crédito</option>
          <option value="cartao_debito" ${pag?.tipo_pagamento==='cartao_debito'?'selected':''}>Cartão Débito</option>
          <option value="dinheiro" ${pag?.tipo_pagamento==='dinheiro'?'selected':''}>Dinheiro</option>
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="f-status">
          <option value="pendente" ${pag?.status==='pendente'?'selected':''}>Pendente</option>
          <option value="recebido" ${pag?.status==='recebido'?'selected':''}>Recebido</option>
          <option value="atraso" ${pag?.status==='atraso'?'selected':''}>Atrasado</option>
          <option value="cancelado" ${pag?.status==='cancelado'?'selected':''}>Cancelado</option>
          <option value="isento" ${pag?.status==='isento'?'selected':''}>Isento</option>
        </select>
      </div>
      <div class="form-group full">
        <label>Número do Recibo Gerado (opcional)</label>
        <input id="f-recibo" type="text" value="${pag?.recibo || ''}" placeholder="Ex: REC-0001">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">Salvar Registro</button>
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => savePagamento(pag?.id));
}

async function savePagamento(id) {
  const selMat = document.getElementById('f-matricula');
  const matricula_id = selMat.value;
  const aluno_id = selMat.options[selMat.selectedIndex]?.dataset.alu || null;
  const curso_id = selMat.options[selMat.selectedIndex]?.dataset.cur || null;
  const valor = parseFloat(document.getElementById('f-valor').value) || null;
  const data_vencimento = document.getElementById('f-venc').value || null;
  const tipo_pagamento = document.getElementById('f-tipo').value;
  const status = document.getElementById('f-status').value;
  const recibo = document.getElementById('f-recibo').value.trim() || null;

  const ok = validateForm([
    { id: 'f-matricula', value: matricula_id,          rules: ['required'], label: 'Matrícula' },
    { id: 'f-valor',     value: String(valor ?? ''),   rules: ['required', 'positive'], label: 'Valor' },
    { id: 'f-venc',      value: data_vencimento ?? '', rules: ['required'], label: 'Data de vencimento' },
  ]);
  if (!ok) return;

  const payload = {
    tenant_id: getTenantId(),
    matricula_id,
    aluno_id,
    curso_id,
    valor,
    data_vencimento,
    tipo_pagamento,
    status,
    recibo
  };

  if (status === 'recebido') {
    payload.data_pagamento = new Date().toISOString().split('T')[0];
  }

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  try {
    let error;
    if(id) {
      const res = await supabase.from('pagamentos').update(payload).eq('id', id).eq('tenant_id', getTenantId());
      error = res.error;
    } else {
      const res = await supabase.from('pagamentos').insert(payload);
      error = res.error;
    }

    if (error) throw error;
    closeModal();
    toast('Salvo com sucesso!', 'success');
    await loadData();
  } catch(e) {
    console.error(e);
    toast('Erro interno.', 'error');
    btn.disabled = false;
    btn.textContent = 'Salvar Registro';
  }
}
