/**
 * /js/views/renovacoes.js
 * Feed de renovações baseado em validade de certificados.
 * Inclui rastreamento de contato por aluno (contato_confirmado).
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast, esc, fmtDate } from '../ui/components.js';
import { criarRenovacao } from '../core/automations.js';

let _alerts = [];

const NIVEL_MAP = {
  vencido: { badge:'badge-red',   label:'Vencido',     cor:'var(--red)'   },
  critico: { badge:'badge-red',   label:'Crítico',     cor:'var(--red)'   },
  atencao: { badge:'badge-amber', label:'Atenção',     cor:'var(--amber)' },
  aviso:   { badge:'badge-blue',  label:'Aviso',       cor:'var(--blue)'  },
};

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Renovações</h1><p>Certificados vencidos e a vencer</p></div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-renovar-todos">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
          Criar Todas as Renovações
        </button>
      </div>
    </div>
    <div class="stats-row" id="renovacoes-kpis">
      ${Array(4).fill('<div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>').join('')}
    </div>
    <div class="table-wrap">
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>Aluno / Empresa</th>
            <th>Curso</th>
            <th>Situação</th>
            <th>Nível</th>
            <th>Contato</th>
            <th>Ações</th>
          </tr></thead>
          <tbody id="renovacoes-tbody">
            <tr><td colspan="6" style="text-align:center;padding:40px">
              <div class="skeleton" style="width:16px;height:16px;border-radius:50%;display:inline-block"></div>
              Carregando Alertas...
            </td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `);

  document.getElementById('btn-renovar-todos')?.addEventListener('click', () => renovarTodos());
  await loadData();
}

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const limitDate = new Date(Date.now() + 90*24*60*60*1000).toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('certificados')
      .select(`
        *,
        aluno:aluno_id(nome, email, telefone, cpf),
        curso:curso_id(nome)
      `)
      .eq('tenant_id', getTenantId())
      .not('data_validade', 'is', null)
      .lte('data_validade', limitDate)
      .order('data_validade');

    if (error) throw error;

    _alerts = (data || []).map(c => {
      const dias  = Math.round((new Date(c.data_validade) - new Date()) / (1000*60*60*24));
      const nivel = dias < 0 ? 'vencido' : dias <= 30 ? 'critico' : dias <= 60 ? 'atencao' : 'aviso';
      return {
        cert_id:               c.id,
        aluno_id:              c.aluno_id,
        curso_id:              c.curso_id,
        aluno:                 c.aluno?.nome      ?? '—',
        aluno_email:           c.aluno?.email     ?? '',
        aluno_tel:             c.aluno?.telefone  ?? '',
        aluno_cpf:             c.aluno?.cpf       ?? '',
        empresa:               '—',   // empresa não está no join aqui — carregado no modal
        curso:                 c.curso?.nome      ?? '—',
        data_validade:         c.data_validade,
        contato_confirmado:    c.contato_confirmado    ?? false,
        contato_confirmado_em: c.contato_confirmado_em ?? null,
        dias,
        nivel,
      };
    });
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar renovações', 'error');
    _alerts = [];
  }

  renderKPIs(_alerts);
  renderTabela(_alerts);
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function renderKPIs(alerts) {
  const vencidos  = alerts.filter(a => a.nivel === 'vencido').length;
  const criticos  = alerts.filter(a => a.nivel === 'critico').length;
  const atencao   = alerts.filter(a => a.nivel === 'atencao').length;
  const pendentes = alerts.filter(a => !a.contato_confirmado && (a.nivel === 'vencido' || a.nivel === 'critico')).length;

  const el = document.getElementById('renovacoes-kpis');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Vencidos</div><div class="stat-value" style="color:var(--red)">${vencidos}</div></div>
    <div class="stat-card"><div class="stat-label">Críticos (30d)</div><div class="stat-value" style="color:var(--amber)">${criticos}</div></div>
    <div class="stat-card"><div class="stat-label">Atenção (60d)</div><div class="stat-value" style="color:var(--blue)">${atencao}</div></div>
    <div class="stat-card"><div class="stat-label">Contato Pendente</div><div class="stat-value" style="color:var(--red)">${pendentes}</div></div>
  `;
}

// ─── Tabela ───────────────────────────────────────────────────────────────────
function renderTabela(alerts) {
  const tbody = document.getElementById('renovacoes-tbody');
  if (!tbody) return;

  if (!alerts.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-tertiary)">Não há alertas de vencimento para os próximos 90 dias.</td></tr>`;
    return;
  }

  tbody.innerHTML = alerts.map(a => {
    const n       = NIVEL_MAP[a.nivel] ?? NIVEL_MAP.aviso;
    const diasTxt = a.dias < 0
      ? `Venceu há ${Math.abs(a.dias)}d`
      : `Vence em ${a.dias}d`;
    const dataFmt = fmtDate(a.data_validade);

    const contatoBadge = a.contato_confirmado
      ? `<span class="badge badge-green" style="display:inline-flex;align-items:center;gap:4px">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="9" height="9"><polyline points="20 6 9 17 4 12"/></svg>
           Confirmado
         </span>`
      : (a.nivel === 'vencido' || a.nivel === 'critico')
        ? `<span class="badge badge-red" style="opacity:.85">Pendente</span>`
        : `<span class="badge badge-gray" style="opacity:.7">Pendente</span>`;

    return `<tr data-cert-id="${a.cert_id}">
      <td>
        <div style="font-weight:500;font-size:13px">${esc(a.aluno)}</div>
        ${a.aluno_email ? `<div style="font-size:11px;color:var(--text-tertiary)">${esc(a.aluno_email)}</div>` : ''}
      </td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${esc(a.curso)}</td>
      <td style="font-size:12.5px;color:${a.dias < 0 ? 'var(--red)' : 'var(--text-secondary)'}">
        ${diasTxt} — ${dataFmt}
      </td>
      <td><span class="badge ${n.badge}">${n.label}</span></td>
      <td>${contatoBadge}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="action-btn action-detalhes" data-cert-id="${a.cert_id}">Detalhes</button>
          <button class="action-btn action-renovar"
            data-aluno-id="${a.aluno_id}"
            data-curso-id="${a.curso_id}"
            data-aluno="${esc(a.aluno)}"
            data-curso="${esc(a.curso)}">
            Renovar
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.action-detalhes').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = _alerts.find(x => x.cert_id === btn.dataset.certId);
      if (a) modalDetalhes(a);
    });
  });

  tbody.querySelectorAll('.action-renovar').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '...';
      const result = await criarRenovacao(btn.dataset.alunoId, btn.dataset.cursoId);
      if (result.ok) {
        toast(`Renovação criada para ${btn.dataset.aluno} — ${btn.dataset.curso}!`, 'success');
        await loadData();
      } else {
        toast(result.reason, 'warning');
        btn.disabled = false;
        btn.textContent = 'Renovar';
      }
    });
  });
}

// ─── Modal de Detalhes ────────────────────────────────────────────────────────
function modalDetalhes(a) {
  const n       = NIVEL_MAP[a.nivel] ?? NIVEL_MAP.aviso;
  const diasTxt = a.dias < 0
    ? `Venceu há <strong style="color:var(--red)">${Math.abs(a.dias)} dias</strong>`
    : `Vence em <strong style="color:${n.cor}">${a.dias} dias</strong>`;

  const contatoStatus = a.contato_confirmado
    ? `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:color-mix(in srgb,var(--green) 10%,transparent);border:1px solid color-mix(in srgb,var(--green) 30%,transparent);border-radius:8px;font-size:12.5px;color:var(--green)">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>
         Contato confirmado${a.contato_confirmado_em ? ` em ${fmtDate(a.contato_confirmado_em)}` : ''}
       </div>`
    : `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:color-mix(in srgb,var(--amber) 10%,transparent);border:1px solid color-mix(in srgb,var(--amber) 30%,transparent);border-radius:8px;font-size:12.5px;color:var(--amber)">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
         Contato ainda não confirmado
       </div>`;

  openModal('Detalhes da Renovação', `
    <!-- Aluno -->
    <div style="background:var(--bg-elevated);border-radius:10px;padding:14px 16px;margin-bottom:14px;border:1px solid var(--border-subtle)">
      <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:10px">${esc(a.aluno)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12.5px;color:var(--text-secondary)">
        ${a.aluno_tel   ? `<div style="display:flex;align-items:center;gap:6px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8a19.79 19.79 0 01-3.07-8.64A2 2 0 012 1h3a2 2 0 012 1.72c.13 1 .39 1.97.76 2.9a2 2 0 01-.45 2.11L6.09 8.91A16 16 0 0015.1 17.9l1.17-1.17a2 2 0 012.12-.46c.93.37 1.9.63 2.9.76A2 2 0 0122 16.92z"/></svg>
            ${esc(a.aluno_tel)}</div>` : ''}
        ${a.aluno_email ? `<div style="display:flex;align-items:center;gap:6px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            ${esc(a.aluno_email)}</div>` : ''}
        ${a.aluno_cpf   ? `<div style="display:flex;align-items:center;gap:6px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
            ${esc(a.aluno_cpf)}</div>` : ''}
      </div>
    </div>

    <!-- Certificado -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;font-size:13px">
      <div style="background:var(--bg-elevated);border-radius:8px;padding:12px;border:1px solid var(--border-subtle)">
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Curso</div>
        <div style="font-weight:600;color:var(--text-primary)">${esc(a.curso)}</div>
      </div>
      <div style="background:var(--bg-elevated);border-radius:8px;padding:12px;border:1px solid var(--border-subtle)">
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Validade</div>
        <div style="font-weight:600;color:var(--text-primary)">${fmtDate(a.data_validade)}</div>
        <div style="font-size:11.5px;margin-top:2px">${diasTxt}</div>
      </div>
    </div>

    <!-- Nível -->
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
      <span style="font-size:12px;color:var(--text-tertiary)">Nível de urgência:</span>
      <span class="badge ${n.badge}" style="font-size:12px">${n.label}</span>
    </div>

    <!-- Status de contato -->
    <div style="margin-bottom:16px">${contatoStatus}</div>

    <div class="modal-footer">
      ${a.contato_confirmado
        ? `<button class="btn btn-secondary" id="btn-contato-desfazer">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M3 12a9 9 0 019-9 9 9 0 016.36 2.64L21 9"/><path d="M3 3v6h6"/></svg>
             Desfazer confirmação
           </button>
           <button class="btn btn-secondary" id="modal-cancel">Fechar</button>`
        : `<button class="btn btn-secondary" id="btn-contato-nao">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
             Contato não realizado
           </button>
           <button class="btn btn-primary" id="btn-contato-sim" style="background:var(--green)">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
             Confirmar contato
           </button>`
      }
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());

  document.getElementById('btn-contato-nao')?.addEventListener('click', () => closeModal());

  document.getElementById('btn-contato-sim')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-contato-sim');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    await _setContato(a.cert_id, true);
  });

  document.getElementById('btn-contato-desfazer')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-contato-desfazer');
    btn.disabled = true;
    btn.textContent = 'Desfazendo...';
    await _setContato(a.cert_id, false);
  });
}

// ─── Confirmar / desfazer contato ────────────────────────────────────────────
async function _setContato(certId, confirmado) {
  try {
    const { error } = await supabase
      .from('certificados')
      .update({
        contato_confirmado:    confirmado,
        contato_confirmado_em: confirmado ? new Date().toISOString() : null,
      })
      .eq('id', certId)
      .eq('tenant_id', getTenantId());

    if (error) throw error;
    closeModal();
    toast(confirmado ? 'Contato confirmado com sucesso.' : 'Confirmação desfeita.', confirmado ? 'success' : 'info');
    await loadData();
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  }
}

// ─── Renovação em massa ───────────────────────────────────────────────────────
async function renovarTodos() {
  const elegíveis = _alerts.filter(a => a.nivel === 'vencido' || a.nivel === 'critico');
  if (!elegíveis.length) {
    toast('Nenhum certificado vencido ou crítico para renovar.', 'info');
    return;
  }

  const btn = document.getElementById('btn-renovar-todos');
  if (btn) { btn.disabled = true; btn.textContent = 'Processando...'; }

  let criados = 0, pulados = 0;
  for (const a of elegíveis) {
    const result = await criarRenovacao(a.aluno_id, a.curso_id);
    if (result.ok) criados++;
    else pulados++;
  }

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Criar Todas as Renovações`;
  }

  toast(
    `${criados} renovação(ões) criada(s)${pulados > 0 ? ` · ${pulados} já possuíam matrícula ativa` : ''}.`,
    criados > 0 ? 'success' : 'info'
  );
  if (criados > 0) await loadData();
}
