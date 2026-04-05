/**
 * /js/views/dashboard.js
 * View do Dashboard — KPIs, Pipeline, Alertas, Financeiro, Turmas, Matrículas, Certificados.
 * Refatorado para usar dados reais do Supabase, skeletons e toasts de erro.
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, fmtDate, fmtMoney, toast } from '../ui/components.js';
import { navigate } from '../core/router.js';
import { runAutomations } from '../core/automations.js';

// ─── Render principal ────────────────────────────────────────────────────────
export async function render() {
  setContent(`
    <div class="page-header">
      <div>
        <h1>Visão Geral</h1>
        <p id="dash-time" style="font-size:12px;color:var(--text-tertiary);margin-top:3px"></p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn-secondary" id="dash-refresh-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
          Atualizar
        </button>
      </div>
    </div>
    <div class="stats-row" id="dash-kpis"></div>
    <div class="dash-grid-main" style="margin-bottom:16px">
      <div class="card" id="card-pipeline"></div>
      <div class="card" id="card-alerts"></div>
    </div>
    <div class="dash-grid-2" style="margin-bottom:16px">
      <div class="card" id="card-financeiro"></div>
      <div class="card" id="card-turmas-ativas"></div>
    </div>
    <div class="dash-grid-2b">
      <div class="card" id="card-ultimas-mat"></div>
      <div class="card" id="card-certs-vencer"></div>
    </div>
  `);

  document.getElementById('dash-time').textContent = 'Atualizado em ' + new Date().toLocaleString('pt-BR');
  document.getElementById('dash-refresh-btn')?.addEventListener('click', () => render());

  setSkeletons();

  // ── Automações em background (não bloqueia o render) ──────────────────────
  runAutomations().then(({ turmasAvancadas, certEmitidos }) => {
    const msgs = [];
    if (turmasAvancadas > 0) msgs.push(`${turmasAvancadas} turma(s) avançada(s)`);
    if (certEmitidos    > 0) msgs.push(`${certEmitidos} certificado(s) emitido(s)`);
    if (msgs.length) {
      toast(`Automações: ${msgs.join(' · ')}`, 'success');
      // Re-renderiza KPIs após automações para refletir novo estado
      renderKPIs();
      renderPipeline();
    }
  });

  try {
    await Promise.all([
      renderKPIs(),
      renderPipeline(),
      renderAlerts(),
      renderFinanceiro(),
      renderTurmas(),
      renderMatriculas(),
      renderCerts(),
    ]);
  } catch (err) {
    toast('Ocorreu um erro ao carregar o dashboard.', 'error');
    console.error('[Dashboard] Erro de renderização:', err);
  }
}

function setSkeletons() {
  const ids = ['dash-kpis', 'card-pipeline', 'card-alerts', 'card-financeiro', 'card-turmas-ativas', 'card-ultimas-mat', 'card-certs-vencer'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === 'dash-kpis') {
        el.innerHTML = Array(5).fill('<div class="stat-card"><div class="skeleton" style="height:60px;width:100%;border-radius:4px"></div></div>').join('');
      } else {
        el.innerHTML = `<div class="card-body" style="padding:16px"><div class="skeleton" style="height:120px;width:100%;border-radius:6px"></div></div>`;
      }
    }
  });
}

// ─── KPIs ────────────────────────────────────────────────────────────────────
async function renderKPIs() {
  let alunosAtivos = 0, emTreinamento = 0, certificadosCount = 0, recebido = 0, alertas = 0;
  
  try {
    const tenant = getTenantId();
    
    const [pAlunos, pMatriculas, pCerts, pPags, pAlertas] = await Promise.all([
      supabase.from('alunos').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant).eq('status', 'ativo'),
      supabase.from('matriculas').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant).eq('status', 'em_andamento'),
      supabase.from('certificados').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant),
      supabase.from('pagamentos').select('valor').eq('tenant_id', tenant).eq('status', 'recebido'),
      supabase.from('certificados').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant).in('status', ['a_vencer', 'vencido'])
    ]);

    if (pAlunos.error) throw pAlunos.error;
    if (pMatriculas.error) throw pMatriculas.error;
    if (pCerts.error) throw pCerts.error;
    if (pPags.error) throw pPags.error;
    if (pAlertas.error) throw pAlertas.error;

    alunosAtivos = pAlunos.count || 0;
    emTreinamento = pMatriculas.count || 0;
    certificadosCount = pCerts.count || 0;
    recebido = pPags.data ? pPags.data.reduce((acc, p) => acc + (p.valor || 0), 0) : 0;
    alertas = pAlertas.count || 0;

  } catch (err) {
    console.error('[KPIs] Erro ao buscar', err);
    toast('Erro ao carregar KPIs', 'error');
  }

  const kpis = [
    { label:'Alunos Ativos',       value: String(alunosAtivos),   delta:'Total cadastrado', up:null,  color:'var(--blue)',   page:'alunos' },
    { label:'Em Treinamento',      value: String(emTreinamento),  delta:'Turmas ativas',    up:null,  color:'var(--accent)', page:'pipeline' },
    { label:'Certificados (total)',value: String(certificadosCount), delta:'Emitidos',      up:null,  color:'var(--purple)', page:'certificados' },
    { label:'Recebido',            value: fmtMoney(recebido),     delta:'Pagamentos pagos', up:null, color:'var(--green)',  page:'financeiro' },
    { label:'Alertas Renovação',   value: String(alertas),        delta:'A vencer / Vencidos', up:false, color:'var(--red)', page:'renovacoes' },
  ];

  const el = document.getElementById('dash-kpis');
  if (!el) return;
  el.innerHTML = kpis.map(k => `
    <div class="stat-card" data-page="${k.page}" style="cursor:pointer">
      <div class="stat-label">${k.label}</div>
      <div class="stat-value" style="color:${k.color}">${k.value}</div>
      <div class="stat-delta ${k.up===true?'up':k.up===false?'down':''}">${k.delta}</div>
    </div>
  `).join('');

  el.querySelectorAll('.stat-card[data-page]').forEach(card => {
    card.addEventListener('click', () => navigate(card.dataset.page));
  });
}

// ─── Pipeline ────────────────────────────────────────────────────────────────
async function renderPipeline() {
  let stats = { matriculado: 0, aguardando_turma: 0, em_andamento: 0, concluido: 0, certificado_emitido: 0 };
  let total = 0;

  try {
    const { data, error } = await supabase
      .from('matriculas')
      .select('status')
      .eq('tenant_id', getTenantId());
      
    if (error) throw error;
    
    if (data) {
      data.forEach(m => {
        if (stats[m.status] !== undefined) stats[m.status]++;
        total++;
      });
    }
  } catch (err) {
    console.error('[Pipeline] Erro:', err);
    toast('Erro ao carregar pipeline', 'error');
  }

  const steps = [
    { label:'Matriculado',   count: stats.matriculado,         color:'var(--blue)' },
    { label:'Ag. Turma',     count: stats.aguardando_turma,    color:'var(--amber)' },
    { label:'Em Andamento',  count: stats.em_andamento,        color:'var(--accent)' },
    { label:'Concluído',     count: stats.concluido,           color:'var(--green)' },
    { label:'Cert. Emitido', count: stats.certificado_emitido, color:'var(--purple)' },
  ];

  const el = document.getElementById('card-pipeline');
  if (!el) return;
  el.innerHTML = `
    <div class="card-header">
      <span class="card-title">Pipeline Operacional</span>
      <span style="font-size:11px;color:var(--text-tertiary)">${total} total</span>
    </div>
    <div class="card-body">
      ${steps.map(s => `
        <div class="pipeline-bar-row">
          <div class="pipeline-bar-meta">
            <span class="label"><span class="dot" style="background:${s.color};display:inline-block;margin-right:6px;vertical-align:middle"></span>${s.label}</span>
            <span class="count">${s.count}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${total > 0 ? (s.count/total*100) : 0}%;background:${s.color}"></div>
          </div>
        </div>
      `).join('')}
    </div>`;
}

// ─── Alertas ─────────────────────────────────────────────────────────────────
async function renderAlerts() {
  let alerts = [];
  try {
    const { data, error } = await supabase
      .from('certificados')
      .select('aluno:aluno_id(nome), curso:curso_id(nome), data_validade, status')
      .eq('tenant_id', getTenantId())
      .in('status', ['a_vencer', 'vencido'])
      .order('data_validade', { ascending: true })
      .limit(6);
      
    if (error) throw error;
    
    if (data) {
      alerts = data.map(c => ({
        label: `${c.aluno?.nome || '—'} — ${c.curso?.nome || '—'}`,
        sub: `Validade: ${fmtDate(c.data_validade)}`,
        color: c.status === 'vencido' ? 'var(--red)' : 'var(--amber)',
        bg: c.status === 'vencido' ? 'var(--red-soft)' : 'var(--amber-soft)'
      }));
    }
  } catch (err) {
    console.error('[Alerts] Erro:', err);
    toast('Erro ao carregar alertas', 'error');
  }

  const el = document.getElementById('card-alerts');
  if (!el) return;

  if (alerts.length === 0) {
    el.innerHTML = `
      <div class="card-header">
        <span class="card-title">Alertas de Renovação</span>
      </div>
      <div class="card-body empty-state" style="padding:24px;min-height:160px;display:flex;flex-direction:column;justify-content:center">
        <p style="text-align:center;color:var(--text-tertiary);font-size:13px">Nenhum alerta de vencimento.</p>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="card-header">
      <span class="card-title">Alertas de Renovação</span>
      <button class="btn btn-ghost" id="btn-ver-alertas" style="font-size:12px;padding:4px 8px">Ver todos</button>
    </div>
    <div class="card-body" style="padding:12px">
      ${alerts.map(a => `
        <div class="alert-item" data-page="renovacoes">
          <div class="alert-icon" style="background:${a.bg};color:${a.color}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>
          </div>
          <div>
            <div style="font-size:12.5px;font-weight:500">${a.label}</div>
            <div style="font-size:11px;color:${a.color};margin-top:2px">${a.sub}</div>
          </div>
        </div>
      `).join('')}
    </div>`;

  el.querySelectorAll('.alert-item').forEach(item => {
    item.addEventListener('click', () => navigate('renovacoes'));
  });
  el.querySelector('#btn-ver-alertas')?.addEventListener('click', () => navigate('renovacoes'));
}

// ─── Financeiro ───────────────────────────────────────────────────────────────
async function renderFinanceiro() {
  let pendente = 0, atraso = 0, pago = 0;
  
  try {
    const { data, error } = await supabase
      .from('pagamentos')
      .select('valor, status')
      .eq('tenant_id', getTenantId());
      
    if (error) throw error;
    
    if (data) {
      data.forEach(p => {
        if (p.status === 'pendente') pendente += (p.valor || 0);
        else if (p.status === 'atraso') atraso += (p.valor || 0);
        else if (p.status === 'recebido') pago += (p.valor || 0);
      });
    }
  } catch (err) {
    console.error('[Financeiro] Erro:', err);
    toast('Erro ao carregar resumo financeiro', 'error');
  }

  const el = document.getElementById('card-financeiro');
  if (!el) return;
  el.innerHTML = `
    <div class="card-header">
      <span class="card-title">Resumo Financeiro</span>
    </div>
    <div class="card-body" style="padding:20px">
      <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px">Total Recebido</div>
      <div style="font-size:24px;font-weight:600;font-family:var(--font-mono);letter-spacing:-1px;color:var(--green);margin-bottom:24px">${fmtMoney(pago)}</div>
      
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:12px;border-bottom:1px solid var(--border-subtle)">
          <span style="font-size:13px;color:var(--text-secondary)">Pendente</span>
          <span style="font-size:14px;font-weight:600;color:var(--amber);font-family:var(--font-mono)">${fmtMoney(pendente)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:13px;color:var(--text-secondary)">Em atraso</span>
          <span style="font-size:14px;font-weight:600;color:var(--red);font-family:var(--font-mono)">${fmtMoney(atraso)}</span>
        </div>
      </div>
    </div>`;
}

// ─── Turmas ativas ────────────────────────────────────────────────────────────
async function renderTurmas() {
  let turmas = [];
  try {
    const { data, error } = await supabase
      .from('turmas')
      .select('codigo, curso_id(nome), instrutor_id(nome), vagas, ocupadas, status')
      .eq('tenant_id', getTenantId())
      .in('status', ['em_andamento', 'agendada'])
      .limit(3);
      
    if (error) throw error;
    
    if (data) {
      turmas = data.map(t => ({
        codigo: t.codigo,
        curso: t.curso_id?.nome || '—',
        instrutor: t.instrutor_id?.nome || '—',
        status: t.status,
        vagas: t.vagas || 0,
        ocupadas: t.ocupadas ?? 0 // CORRIGIDO: lê coluna real do banco
      }));
    }
  } catch (err) {
    console.error('[Turmas] Erro:', err);
    toast('Erro ao carregar turmas', 'error');
  }

  const el = document.getElementById('card-turmas-ativas');
  if (!el) return;
  
  if (turmas.length === 0) {
    el.innerHTML = `
      <div class="card-header">
        <span class="card-title">Turmas em Andamento</span>
      </div>
      <div class="card-body empty-state" style="padding:24px;display:flex;justify-content:center;align-items:center;min-height:160px">
        <p style="font-size:13px;color:var(--text-tertiary)">Não há turmas ativas/agendadas.</p>
      </div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="card-header">
      <span class="card-title">Turmas em Andamento</span>
      <button class="btn btn-ghost" id="btn-ver-turmas" style="font-size:12px;padding:4px 8px">Ver todas</button>
    </div>
    <div class="card-body" style="padding:12px;display:flex;flex-direction:column;gap:8px">
      ${turmas.map(t => `
        <div style="padding:10px 12px;background:var(--bg-elevated);border:1px solid var(--border-default);border-radius:var(--radius-sm)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-size:12.5px;font-weight:500">${t.curso}</div>
              <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${t.codigo} · ${t.instrutor}</div>
            </div>
            <span class="badge ${t.status==='em_andamento'?'badge-accent':t.status==='agendada'?'badge-blue':'badge-green'}">${t.status==='em_andamento'?'Ativo':t.status==='agendada'?'Agendado':'Concluído'}</span>
          </div>
          <div style="margin-top:8px">
            <div class="progress-bar">
              <div class="progress-fill" style="width:${t.vagas > 0 ? Math.round(t.ocupadas/t.vagas*100) : 0}%;background:var(--accent)"></div>
            </div>
            <div style="font-size:10.5px;color:var(--text-tertiary);margin-top:3px">${t.ocupadas}/${t.vagas} alunos</div>
          </div>
        </div>
      `).join('')}
    </div>`;
  el.querySelector('#btn-ver-turmas')?.addEventListener('click', () => navigate('turmas'));
}

// ─── Últimas matrículas ───────────────────────────────────────────────────────
async function renderMatriculas() {
  let alunos = [];
  try {
    const { data, error } = await supabase
      .from('matriculas')
      .select('status, aluno:aluno_id(nome), curso:curso_id(nome)')
      .eq('tenant_id', getTenantId())
      .order('created_at', { ascending: false })
      .limit(5);
      
    if (error) throw error;
    if (data) alunos = data.map(m => ({ nome: m.aluno?.nome ?? '—', curso: m.curso?.nome ?? '—', status: m.status }));
  } catch (err) {
    console.error('[Matriculas] Erro:', err);
    toast('Erro ao carregar matrículas', 'error');
  }

  const el = document.getElementById('card-ultimas-mat');
  if (!el) return;
  
  el.innerHTML = `
    <div class="card-header">
      <span class="card-title">Últimas Matrículas</span>
      <button class="btn btn-ghost" id="btn-ver-mats" style="font-size:12px;padding:4px 8px">Ver todas</button>
    </div>
    <div style="overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="padding:10px 16px;font-size:10.5px;color:var(--text-tertiary);text-align:left;border-bottom:1px solid var(--border-subtle);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Aluno</th>
          <th style="padding:10px 16px;font-size:10.5px;color:var(--text-tertiary);text-align:left;border-bottom:1px solid var(--border-subtle);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Curso</th>
          <th style="padding:10px 16px;font-size:10.5px;color:var(--text-tertiary);text-align:left;border-bottom:1px solid var(--border-subtle);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Status</th>
        </tr></thead>
        <tbody>
          ${alunos.length > 0 ? alunos.map(a => `
            <tr style="border-bottom:1px solid var(--border-subtle)">
              <td style="padding:10px 16px;font-size:13px">${a.nome}</td>
              <td style="padding:10px 16px;font-size:12px;color:var(--text-secondary)">${a.curso}</td>
              <td style="padding:10px 16px"><span class="badge badge-gray" style="font-size:10.5px">${a.status.replace('_', ' ')}</span></td>
            </tr>
          `).join('') : `<tr><td colspan="3" style="text-align:center;padding:20px;font-size:13px;color:var(--text-tertiary)">Nenhuma matrícula recente.</td></tr>`}
        </tbody>
      </table>
    </div>`;
  el.querySelector('#btn-ver-mats')?.addEventListener('click', () => navigate('matriculas'));
}

// ─── Certificados ─────────────────────────────────────────────────────────────
async function renderCerts() {
  let certs = [];
  try {
    const { data, error } = await supabase
      .from('certificados')
      .select('aluno:aluno_id(nome), curso:curso_id(nome), data_validade, status')
      .eq('tenant_id', getTenantId())
      .order('data_validade', { ascending: true })
      .limit(4);
      
    if (error) throw error;
    if (data) certs = data.map(c => ({ aluno: c.aluno?.nome ?? '—', curso: c.curso?.nome ?? '—', validade: c.data_validade, status: c.status }));
  } catch (err) {
    console.error('[Certs] Erro:', err);
    toast('Erro ao carregar certificados', 'error');
  }

  const el = document.getElementById('card-certs-vencer');
  if (!el) return;
  el.innerHTML = `
    <div class="card-header">
      <span class="card-title">Certificados Recentes/Próximos</span>
    </div>
    <div class="card-body" style="padding:12px">
      ${certs.length > 0 ? certs.map(c => `
        <div class="cert-card">
          <div class="cert-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>
          </div>
          <div class="cert-info">
            <div class="cert-name">${c.aluno}</div>
            <div class="cert-meta">${c.curso} · Val: ${fmtDate(c.validade)}</div>
          </div>
          <span class="badge ${c.status==='valido'?'badge-green':c.status==='a_vencer'?'badge-amber':'badge-red'}">
            ${c.status==='valido'?'Válido':c.status==='a_vencer'?'A vencer':'Vencido'}
          </span>
        </div>
      `).join('') : `<p style="text-align:center;padding:20px;color:var(--text-tertiary);font-size:13px">Nenhum certificado encontrado.</p>`}
    </div>`;
}
