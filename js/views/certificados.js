/**
 * /js/views/certificados.js
 * CRUD real para Certificados.
 *
 * [FIX CRÍTICO] Status recalculado em tempo real ao carregar:
 *   - valido     : data_validade ≥ hoje + 30 dias
 *   - a_vencer   : data_validade entre hoje e hoje + 30 dias
 *   - vencido    : data_validade < hoje
 * O banco é atualizado em lote (batch) quando o status diverge.
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast, fmtDate, esc } from '../ui/components.js';
import EssealDatePicker from '../../esseal-date-picker-main/index.js';

let _certs = [];
let _alunos = [];
let _cursos = [];

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Certificados</h1><p>Emissão, QR Code e controle de validade</p></div>
      <div class="page-header-actions">
        <button class="btn btn-secondary" id="btn-exportar-lote">Exportar CSV</button>
        <button class="btn btn-primary" id="btn-emitir">Emitir Certificado</button>
      </div>
    </div>
    <div class="stats-row" id="certs-kpis">
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
    </div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-certs" placeholder="Aluno, curso ou código...">
        </div>
        <select class="select-input" id="filtro-status-cert">
          <option value="">Todos os status</option>
          <option value="valido">Válidos</option>
          <option value="a_vencer">A Vencer</option>
          <option value="vencido">Vencidos</option>
        </select>
      </div>
      <table>
        <thead><tr><th>Aluno</th><th>Curso</th><th>Código Verificação</th><th>Emissão</th><th>Validade</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody id="certs-tbody">
          <tr><td colspan="7" style="text-align:center;padding:40px"><div class="skeleton" style="width:16px;height:16px;border-radius:50%;display:inline-block"></div> Carregando...</td></tr>
        </tbody>
      </table>
    </div>
  `);

  document.getElementById('btn-exportar-lote')?.addEventListener('click', () => toast('Função de PDF Lote em desenvolvimento', 'info'));
  document.getElementById('btn-emitir')?.addEventListener('click', () => modalEmitir());
  document.getElementById('search-certs')?.addEventListener('input', applyFilter);
  document.getElementById('filtro-status-cert')?.addEventListener('change', applyFilter);

  await Promise.all([loadCerts(), loadAux()]);
}

async function loadAux() {
  try {
    const p1 = supabase.from('alunos').select('id, nome').eq('tenant_id', getTenantId()).order('nome');
    const p2 = supabase.from('cursos').select('id, nome, validade_meses').eq('tenant_id', getTenantId()).order('nome');
    
    const [r1, r2] = await Promise.all([p1, p2]);
    _alunos = r1.data || [];
    _cursos = r2.data || [];
  } catch (err) {
    console.error(err);
  }
}

async function loadCerts() {
  try {
    const { data, error } = await supabase
      .from('certificados')
      .select('*, aluno:aluno_id(nome), curso:curso_id(nome)')
      .eq('tenant_id', getTenantId())
      .order('created_at', { ascending: false });

    if (error) throw error;
    _certs = (data || []).map(c => ({
      ...c,
      aluno_nome: c.aluno?.nome || '—',
      curso_nome: c.curso?.nome || '—',
    }));
  } catch (err) {
    toast('Erro ao carregar certificados', 'error');
    _certs = [];
  }

  // [FIX CRÍTICO] Recalcula e sincroniza status com base na data_validade atual
  await syncCertStatuses();

  renderKPIs(_certs);
  applyFilter();
}

/**
 * Recalcula o status correto de cada certificado.
 * Se divergir do banco, envia batch de updates.
 * Limiar: a_vencer = < 30 dias para vencer.
 */
async function syncCertStatuses() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const em30dias = new Date(today);
  em30dias.setDate(today.getDate() + 30);

  const para_atualizar = [];

  _certs = _certs.map(c => {
    if (!c.data_validade) return c; // sem validade = sempre 'valido'

    const validade = new Date(c.data_validade + 'T00:00:00');
    let novoStatus;
    if (validade < today)         novoStatus = 'vencido';
    else if (validade <= em30dias) novoStatus = 'a_vencer';
    else                           novoStatus = 'valido';

    if (novoStatus !== c.status) {
      para_atualizar.push({ id: c.id, status: novoStatus });
      return { ...c, status: novoStatus };
    }
    return c;
  });

  if (para_atualizar.length === 0) return;

  // Atualiza em paralelo (batch individual por id — Supabase não tem bulk update direto)
  await Promise.allSettled(
    para_atualizar.map(({ id, status }) =>
      supabase
        .from('certificados')
        .update({ status })
        .eq('id', id)
        .eq('tenant_id', getTenantId())
    )
  );

  if (para_atualizar.length > 0) {
    console.info(`[Certificados] ${para_atualizar.length} status atualizado(s) automaticamente.`);
  }
}

function renderKPIs(certs) {
  const v = certs.filter(c => c.status === 'valido').length;
  const a = certs.filter(c => c.status === 'a_vencer').length;
  const exp = certs.filter(c => c.status === 'vencido').length;

  const el = document.getElementById('certs-kpis');
  if(!el) return;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Emitidos</div><div class="stat-value" style="color:var(--purple)">${certs.length}</div></div>
    <div class="stat-card"><div class="stat-label">Válidos</div><div class="stat-value" style="color:var(--green)">${v}</div></div>
    <div class="stat-card"><div class="stat-label">A Vencer</div><div class="stat-value" style="color:var(--amber)">${a}</div></div>
    <div class="stat-card"><div class="stat-label">Vencidos</div><div class="stat-value" style="color:var(--red)">${exp}</div></div>
  `;
}

function applyFilter() {
  const q  = document.getElementById('search-certs')?.value.toLowerCase() || '';
  const st = document.getElementById('filtro-status-cert')?.value || '';
  const f  = _certs.filter(c =>
    (!q  || c.aluno_nome.toLowerCase().includes(q) || c.curso_nome.toLowerCase().includes(q) || (c.codigo_verificacao||'').toLowerCase().includes(q)) &&
    (!st || c.status === st)
  );
  
  const tbody = document.getElementById('certs-tbody');
  if(!tbody) return;

  if(!f.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-tertiary)">Nenhum certificado encontrado</td></tr>`;
    return;
  }

  tbody.innerHTML = f.map(c => `
    <tr>
      <td style="font-weight:500">${esc(c.aluno_nome)}</td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${esc(c.curso_nome)}</td>
      <td><span style="font-family:var(--font-mono);font-size:11.5px;color:var(--text-tertiary)">${esc(c.codigo_verificacao || '—')}</span></td>
      <td style="font-size:12.5px">${c.data_emissao ? fmtDate(c.data_emissao) : '—'}</td>
      <td style="font-size:12.5px">${c.data_validade ? fmtDate(c.data_validade) : 'Sem validade'}</td>
      <td><span class="badge ${c.status==='valido'?'badge-green':c.status==='a_vencer'?'badge-amber':'badge-red'}">${c.status==='valido'?'Válido':c.status==='a_vencer'?'A Vencer':'Vencido'}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="action-btn" data-action="pdf" data-id="${c.id}">PDF</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.action-btn[data-action="pdf"]').forEach(b => {
    b.addEventListener('click', () => {
      const cert = _certs.find(c => c.id === b.dataset.id);
      if (cert) gerarPDF(cert);
    });
  });
}

// ─── Geração de PDF do Certificado ───────────────────────────────────────────
async function gerarPDF(cert) {
  toast('Gerando certificado PDF...', 'info');
  try {
    if (typeof window.jspdf === 'undefined') {
      await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210;

    // ── Fundo e borda ──────────────────────────────────────────────────────
    doc.setFillColor(10, 12, 18);
    doc.rect(0, 0, W, H, 'F');

    // Borda externa dourada
    doc.setDrawColor(99, 255, 171);
    doc.setLineWidth(1.5);
    doc.rect(8, 8, W - 16, H - 16);

    // Borda interna sutil
    doc.setDrawColor(40, 60, 50);
    doc.setLineWidth(0.5);
    doc.rect(11, 11, W - 22, H - 22);

    // ── Marca d'água sutil ─────────────────────────────────────────────────
    doc.setTextColor(99, 255, 171);
    doc.setFontSize(120);
    doc.setFont('helvetica', 'bold');
    doc.setGState(new doc.GState({ opacity: 0.04 }));
    doc.text('EDU', W / 2, H / 2 + 30, { align: 'center' });
    doc.setGState(new doc.GState({ opacity: 1 }));

    // ── Header: Logo EduOS ────────────────────────────────────────────────
    doc.setFillColor(99, 255, 171);
    doc.roundedRect(20, 16, 20, 20, 3, 3, 'F');
    doc.setTextColor(10, 12, 18);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('E', 30, 29.5, { align: 'center' });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.text('EduOS', 44, 24);
    doc.setTextColor(99, 255, 171);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Plataforma de Gestão Educacional', 44, 30);

    // ── Título: CERTIFICADO ────────────────────────────────────────────────
    doc.setTextColor(99, 255, 171);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text('CERTIFICADO DE CONCLUSÃO', W / 2, 28, { align: 'center', charSpace: 3 });

    // Linha decorativa sob o título
    doc.setDrawColor(99, 255, 171);
    doc.setLineWidth(0.8);
    doc.line(W / 2 - 50, 32, W / 2 + 50, 32);

    // ── Texto central ──────────────────────────────────────────────────────
    doc.setTextColor(160, 170, 160);
    doc.setFontSize(10);
    doc.text('Certificamos que', W / 2, 58, { align: 'center' });

    // Nome do aluno (destaque máximo)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text(cert.aluno_nome.toUpperCase(), W / 2, 76, { align: 'center' });

    // Linha sob o nome
    doc.setDrawColor(99, 255, 171);
    doc.setLineWidth(0.4);
    const nomeWidth = Math.min(doc.getTextWidth(cert.aluno_nome.toUpperCase()) + 10, W - 40);
    doc.line(W / 2 - nomeWidth / 2, 80, W / 2 + nomeWidth / 2, 80);

    // Texto de conclusão
    doc.setTextColor(160, 170, 160);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('concluiu com aproveitamento o curso de', W / 2, 93, { align: 'center' });

    // Nome do curso
    doc.setTextColor(99, 255, 171);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(cert.curso_nome.toUpperCase(), W / 2, 108, { align: 'center' });

    // ── Rodapé: datas e código ─────────────────────────────────────────────
    const emissaoFmt = cert.data_emissao
      ? new Date(cert.data_emissao + 'T00:00:00').toLocaleDateString('pt-BR')
      : '—';
    const validadeFmt = cert.data_validade
      ? new Date(cert.data_validade + 'T00:00:00').toLocaleDateString('pt-BR')
      : 'Sem validade';

    // Box de informações (3 colunas)
    doc.setFillColor(15, 22, 15);
    doc.roundedRect(20, 128, 257, 28, 2, 2, 'F');

    doc.setTextColor(99, 255, 171);
    doc.setFontSize(8);
    doc.setFont('courier', 'normal');

    // Col 1: Data de emissão
    doc.setTextColor(100, 110, 100);
    doc.text('DATA DE EMISSÃO', 45, 138, { align: 'center' });
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(emissaoFmt, 45, 147, { align: 'center' });

    // Col 2: Validade
    doc.setTextColor(100, 110, 100);
    doc.setFontSize(8);
    doc.text('VÁLIDO ATÉ', W / 2, 138, { align: 'center' });
    doc.setTextColor(cert.status === 'vencido' ? 220 : 255, cert.status === 'vencido' ? 80 : 255, cert.status === 'vencido' ? 80 : 255);
    doc.setFontSize(10);
    doc.text(validadeFmt, W / 2, 147, { align: 'center' });

    // Col 3: Código
    doc.setTextColor(100, 110, 100);
    doc.setFontSize(8);
    doc.text('CÓDIGO DE VERIFICAÇÃO', W - 45, 138, { align: 'center' });
    doc.setTextColor(99, 255, 171);
    doc.setFontSize(9);
    doc.text(cert.codigo_verificacao || '—', W - 45, 147, { align: 'center' });

    // ── Status badge ───────────────────────────────────────────────────────
    const statusColors = {
      valido:   [22, 163, 74],
      a_vencer: [202, 138, 4],
      vencido:  [185, 28, 28],
    };
    const [r, g, b] = statusColors[cert.status] ?? [100, 100, 100];
    doc.setFillColor(r, g, b);
    doc.roundedRect(W - 55, 14, 34, 9, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    const statusLabel = cert.status === 'valido' ? 'VÁLIDO' : cert.status === 'a_vencer' ? 'A VENCER' : 'VENCIDO';
    doc.text(statusLabel, W - 38, 20.5, { align: 'center' });

    // ── Salva o PDF ────────────────────────────────────────────────────────
    const nomeSanitizado = cert.aluno_nome.replace(/[^a-zA-Z0-9 ]/g, '').replace(/ /g, '_');
    doc.save(`Certificado_${nomeSanitizado}.pdf`);
    toast('Certificado PDF gerado!', 'success');
  } catch (err) {
    console.error('[PDF] Erro:', err);
    toast('Erro ao gerar PDF do certificado.', 'error');
  }
}

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function modalEmitir() {
  const aluOpts = _alunos.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('');
  const curOpts = _cursos.map(c => `<option value="${c.id}" data-val="${c.validade_meses ?? 'null'}">${esc(c.nome)}</option>`).join('');

  openModal('Emitir Certificado', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Aluno *</label>
        <select id="f-aluno">
          <option value="">— Selecionar aluno —</option>
          ${aluOpts}
        </select>
      </div>
      <div class="form-group full">
        <label>Curso *</label>
        <select id="f-curso">
          <option value="">— Selecionar curso —</option>
          ${curOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Data de Emissão</label>
        <input id="f-emissao" type="text" readonly placeholder="Selecione..." value="${new Date().toISOString().split('T')[0]}">
      </div>
      <div class="form-group">
        <label>Data de Validade (opcional)</label>
        <input id="f-validade" type="text" readonly placeholder="Selecione...">
        <small style="color:var(--text-tertiary)" id="f-validade-help">Preenchido auto se curso tiver expiração.</small>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">Salvar e Gerar Código</button>
    </div>
  `);

  document.getElementById('f-curso')?.addEventListener('change', function() {
    const rawVal = this.options[this.selectedIndex]?.dataset.val;
    const months = parseInt(rawVal) || 0;
    const help   = document.getElementById('f-validade-help');
    const input  = document.getElementById('f-validade');

    if (rawVal === 'null' || rawVal === '' || rawVal === '0') {
      // Curso vitalício — sem data de validade
      input.value    = '';
      input.disabled = true;
      if (help) help.innerHTML = '<span style="color:var(--accent);font-family:var(--font-mono)">Vitalício — certificado sem prazo de expiração.</span>';
    } else if (months > 0) {
      input.disabled = false;
      const d = new Date(document.getElementById('f-emissao').value || new Date());
      d.setMonth(d.getMonth() + months);
      input.value = d.toISOString().split('T')[0];
      if (help) help.textContent = `Calculado automaticamente: ${months} meses após a emissão.`;
    } else {
      input.disabled = false;
      input.value    = '';
      if (help) help.textContent = 'Preencha manualmente ou selecione um curso.';
    }
  });

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => saveCert());

  // ── Inicializa o EssealDatePicker ──
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#63ffab';
  new EssealDatePicker('#f-emissao', {
    primaryColor,
    format: (d) => d.toISOString().split('T')[0]
  });
  new EssealDatePicker('#f-validade', {
    primaryColor,
    format: (d) => d.toISOString().split('T')[0]
  });
}

async function saveCert() {
  const aluno_id = document.getElementById('f-aluno').value;
  const curso_id = document.getElementById('f-curso').value;
  const data_emissao = document.getElementById('f-emissao').value;
  const data_validade = document.getElementById('f-validade').value || null;

  if (!aluno_id || !curso_id) {
    toast('Aluno e Curso são obrigatórios.', 'warning');
    return;
  }

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  btn.textContent = 'Aguarde...';

  try {
    // 1. Verify if matricula is completed
    const { data: matriculas, error: errMat } = await supabase
      .from('matriculas')
      .select('status, id')
      .eq('tenant_id', getTenantId())
      .eq('aluno_id', aluno_id)
      .eq('curso_id', curso_id)
      .eq('status', 'concluido');
    
    if (errMat) throw errMat;
    if (!matriculas || matriculas.length === 0) {
      toast('Aluno não concluiu o curso selecionado.', 'warning');
      btn.disabled = false;
      btn.textContent = 'Salvar e Gerar Código';
      return;
    }

    // 2. Verify if there are unpaid financial records
    const { data: pendencias, error: errFin } = await supabase
      .from('pagamentos')
      .select('id')
      .eq('tenant_id', getTenantId())
      .eq('aluno_id', aluno_id)
      .eq('curso_id', curso_id)
      .in('status', ['pendente', 'atraso']);
    
    if (errFin) throw errFin;
    if (pendencias && pendencias.length > 0) {
      toast('Aluno possui pendências financeiras para este curso.', 'warning');
      btn.disabled = false;
      btn.textContent = 'Salvar e Gerar Código';
      return;
    }

    btn.textContent = 'Gerando...';

    const codGerado = 'CRT-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Date.now().toString().slice(-4);

    const payload = {
      tenant_id: getTenantId(),
      aluno_id,
      curso_id,
      matricula_id: matriculas[0].id,
      data_emissao,
      data_validade,
      codigo_verificacao: codGerado,
      status: 'valido'
    };

    const { error } = await supabase.from('certificados').insert(payload);
    if (error) throw error;
    closeModal();
    toast('Certificado emitido com sucesso!', 'success');
    await loadCerts();
  } catch(e) {
    console.error(e);
    toast('Erro ao emitir certificado.', 'error');
    btn.disabled = false;
    btn.textContent = 'Salvar e Gerar Código';
  }
}
