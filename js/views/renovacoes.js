/**
 * /js/views/renovacoes.js
 * Read-only feed de renovações baseado em validade de certificados do banco
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, toast, esc, fmtDate } from '../ui/components.js';
import { criarRenovacao } from '../core/automations.js';

let _alerts = [];

const NIVEL_MAP = {
  vencido: { badge:'badge-red',   label:'Vencido' },
  critico: { badge:'badge-red',   label:'Crítico' },
  atencao: { badge:'badge-amber', label:'Atenção' },
  aviso:   { badge:'badge-blue',  label:'Aviso'   },
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
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Aluno / Empresa</th><th>Curso</th><th>Situação</th><th>Nível</th><th>Ações</th></tr></thead>
        <tbody id="renovacoes-tbody">
          <tr><td colspan="5" style="text-align:center;padding:40px"><div class="skeleton" style="width:16px;height:16px;border-radius:50%;display:inline-block"></div> Carregando Alertas...</td></tr>
        </tbody>
      </table>
    </div>
  `);

  document.getElementById('btn-renovar-todos')?.addEventListener('click', () => renovarTodos());

  await loadData();
}

async function loadData() {
  try {
    // Busca certificados vencidos ou a vencer em até 90 dias
    const limitDate = new Date(Date.now() + 90*24*60*60*1000).toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('certificados')
      .select('*, aluno:aluno_id(nome, empresa:empresa_id(nome)), curso:curso_id(nome)')
      .eq('tenant_id', getTenantId())
      .not('data_validade', 'is', null)
      .lte('data_validade', limitDate)
      .order('data_validade');

    if (error) throw error;

    if (data?.length) {
      _alerts = data.map(c => {
        const dias = Math.round((new Date(c.data_validade) - new Date()) / (1000*60*60*24));
        const nivel = dias < 0 ? 'vencido' : dias <= 30 ? 'critico' : dias <= 60 ? 'atencao' : 'aviso';
        return {
          id:           c.id,
          aluno_id:     c.aluno_id,
          curso_id:     c.curso_id,
          aluno:        c.aluno?.nome         ?? '—',
          empresa:      c.aluno?.empresa?.nome ?? '—',
          curso:        c.curso?.nome          ?? '—',
          data_validade: c.data_validade,
          dias,
          nivel,
        };
      });
    } else {
      _alerts = [];
    }
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar renovações', 'error');
    _alerts = [];
  }
  
  renderKPIs(_alerts);
  renderTabela(_alerts);
}

function renderKPIs(alerts) {
  const vencidos = alerts.filter(a => a.nivel === 'vencido').length;
  const criticos = alerts.filter(a => a.nivel === 'critico').length;
  const atencao  = alerts.filter(a => a.nivel === 'atencao').length;
  const alerta   = alerts.filter(a => a.nivel === 'aviso').length;

  const el = document.getElementById('renovacoes-kpis');
  if(!el) return;

  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Vencidos</div><div class="stat-value" style="color:var(--red)">${vencidos}</div></div>
    <div class="stat-card"><div class="stat-label">Críticos (30d)</div><div class="stat-value" style="color:var(--amber)">${criticos}</div></div>
    <div class="stat-card"><div class="stat-label">Atenção (60d)</div><div class="stat-value" style="color:var(--blue)">${atencao}</div></div>
    <div class="stat-card"><div class="stat-label">Aviso (90d)</div><div class="stat-value" style="color:var(--text-tertiary)">${alerta}</div></div>
  `;
}

function renderTabela(alerts) {
  const tbody = document.getElementById('renovacoes-tbody');
  if(!tbody) return;

  if(!alerts.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-tertiary)">Não há alertas de vencimento para os próximos 90 dias.</td></tr>`;
    return;
  }

  tbody.innerHTML = alerts.map(a => {
    const n = NIVEL_MAP[a.nivel] ?? NIVEL_MAP.aviso;
    const diasTxt = a.dias < 0 ? `Venceu há ${Math.abs(a.dias)} dias` : `Vence em ${a.dias} dias`;
    return `<tr>
      <td>
        <div style="font-weight:500;font-size:13px">${esc(a.aluno)}</div>
        <div style="font-size:11.5px;color:var(--text-tertiary)">${esc(a.empresa)}</div>
      </td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${esc(a.curso)}</td>
      <td style="font-size:12.5px;color:${a.dias<0?'var(--red)':'var(--text-secondary)'}">${diasTxt} — ${fmtDate(a.data_validade)}</td>
      <td><span class="badge ${n.badge}">${n.label}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="action-btn action-renovar"
            data-aluno-id="${a.aluno_id}"
            data-curso-id="${a.curso_id}"
            data-aluno="${esc(a.aluno)}"
            data-curso="${esc(a.curso)}">
            Criar Renovação
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  document.querySelectorAll('.action-renovar').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Criando...';
      const result = await criarRenovacao(btn.dataset.alunoId, btn.dataset.cursoId);
      if (result.ok) {
        toast(`Renovação criada para ${btn.dataset.aluno} — ${btn.dataset.curso}!`, 'success');
        await loadData();
      } else {
        toast(result.reason, 'warning');
        btn.disabled = false;
        btn.textContent = 'Criar Renovação';
      }
    });
  });
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

  if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> Criar Todas as Renovações'; }

  toast(
    `${criados} renovação(ões) criada(s)${pulados > 0 ? ` · ${pulados} já possuíam matrícula ativa` : ''}.`,
    criados > 0 ? 'success' : 'info'
  );
  if (criados > 0) await loadData();
}
