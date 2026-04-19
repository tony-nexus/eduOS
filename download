/**
 * /js/views/portal-aluno.js
 * Portal do Aluno — acessível apenas pelo perfil 'aluno'.
 * Exibe matrículas, certificados e pagamentos do aluno logado.
 */

import { supabase } from '../core/supabase.js';
import { setContent, toast, fmtDate, fmtMoney, esc } from '../ui/components.js';

const SUPABASE_URL = 'https://wyetjiymimfdtiwmvjsj.supabase.co';

// ─── Helpers de badge ─────────────────────────────────────────────────────────

const MAT_BADGE = {
  matriculado:         ['badge-blue',   'Matriculado'],
  aguardando_turma:    ['badge-amber',  'Ag. Turma'],
  em_andamento:        ['badge-green',  'Em Andamento'],
  concluido:           ['badge-teal',   'Concluído'],
  certificado_emitido: ['badge-purple', 'Certificado'],
  cancelado:           ['badge-red',    'Cancelado'],
};

const CERT_BADGE = {
  valido:   ['badge-green',  'Válido'],
  a_vencer: ['badge-amber',  'A Vencer'],
  vencido:  ['badge-red',    'Vencido'],
  revogado: ['badge-red',    'Revogado'],
};

const PAG_BADGE = {
  pendente:  ['badge-amber',  'Pendente'],
  recebido:  ['badge-green',  'Pago'],
  atraso:    ['badge-red',    'Em Atraso'],
  cancelado: ['badge-red',    'Cancelado'],
  isento:    ['badge-teal',   'Isento'],
};

function badge(map, key) {
  const [cls, label] = map[key] ?? ['badge-blue', key];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── Render principal ─────────────────────────────────────────────────────────

export async function render() {
  const user = globalThis.__eduos_auth?.currentUser;

  setContent(`
    <div class="page-header">
      <div>
        <h1>Meu Portal</h1>
        <p style="font-size:12px;color:var(--text-tertiary);margin-top:3px">
          Bem-vindo, <strong>${esc(user?.name ?? 'Aluno')}</strong>
        </p>
      </div>
    </div>

    <div class="stats-row" id="portal-kpis">
      <div class="stat-card"><div class="skeleton" style="height:44px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:44px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:44px;width:100%"></div></div>
      <div class="stat-card"><div class="skeleton" style="height:44px;width:100%"></div></div>
    </div>

    <div class="dash-grid-2" style="margin-bottom:16px">
      <div class="card" id="card-mat">
        <div class="card-header" style="padding:16px 20px 0">
          <span style="font-size:13px;font-weight:600">Minhas Matrículas</span>
        </div>
        <div id="mat-body" style="padding:12px 20px 16px">
          <div class="skeleton" style="height:80px;border-radius:var(--radius-sm)"></div>
        </div>
      </div>
      <div class="card" id="card-certs">
        <div class="card-header" style="padding:16px 20px 0">
          <span style="font-size:13px;font-weight:600">Meus Certificados</span>
        </div>
        <div id="certs-body" style="padding:12px 20px 16px">
          <div class="skeleton" style="height:80px;border-radius:var(--radius-sm)"></div>
        </div>
      </div>
    </div>

    <div class="card" id="card-pag">
      <div class="card-header" style="padding:16px 20px 0">
        <span style="font-size:13px;font-weight:600">Meus Pagamentos</span>
      </div>
      <div id="pag-body" style="padding:12px 20px 16px">
        <div class="skeleton" style="height:80px;border-radius:var(--radius-sm)"></div>
      </div>
    </div>
  `);

  // Busca aluno pelo user_id do usuário logado
  const { data: alunoRow, error: alunoErr } = await supabase
    .from('alunos')
    .select('id, nome, email, cpf')
    .eq('user_id', user?.id)
    .single();

  if (alunoErr || !alunoRow) {
    document.getElementById('mat-body').innerHTML   = _emptyState('Perfil de aluno não vinculado a este usuário.');
    document.getElementById('certs-body').innerHTML = _emptyState('—');
    document.getElementById('pag-body').innerHTML   = _emptyState('—');
    toast('Perfil de aluno não encontrado. Contate a secretaria.', 'warning');
    return;
  }

  const alunoId = alunoRow.id;

  const [matsRes, certsRes, pagsRes] = await Promise.all([
    supabase
      .from('matriculas')
      .select('id, status, created_at, observacoes, curso:curso_id(nome), turma:turma_id(codigo, data_inicio, data_fim)')
      .eq('aluno_id', alunoId)
      .order('created_at', { ascending: false }),

    supabase
      .from('certificados')
      .select('id, status, data_emissao, data_validade, codigo_verificacao, curso:curso_id(nome)')
      .eq('aluno_id', alunoId)
      .order('data_emissao', { ascending: false }),

    supabase
      .from('pagamentos')
      .select('id, status, valor, data_vencimento, data_pagamento, tipo_pagamento, curso:curso_id(nome)')
      .eq('aluno_id', alunoId)
      .order('data_vencimento', { ascending: false }),
  ]);

  _renderKPIs(matsRes.data ?? [], certsRes.data ?? [], pagsRes.data ?? []);
  _renderMatriculas(matsRes.data ?? []);
  _renderCertificados(certsRes.data ?? []);
  _renderPagamentos(pagsRes.data ?? []);
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────

function _renderKPIs(mats, certs, pags) {
  const ativas   = mats.filter(m => ['matriculado','em_andamento','aguardando_turma'].includes(m.status)).length;
  const concluidas = mats.filter(m => ['concluido','certificado_emitido'].includes(m.status)).length;
  const certValidos = certs.filter(c => c.status === 'valido' || c.status === 'a_vencer').length;
  const totalPend  = (pags.filter(p => p.status === 'pendente' || p.status === 'atraso')
    .reduce((s, p) => s + Number(p.valor), 0));

  document.getElementById('portal-kpis').innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${ativas}</div>
      <div class="stat-label">Matrículas Ativas</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${concluidas}</div>
      <div class="stat-label">Cursos Concluídos</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${certValidos}</div>
      <div class="stat-label">Certificados Válidos</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color:${totalPend > 0 ? 'var(--amber)' : 'var(--text-primary)'}">${fmtMoney(totalPend)}</div>
      <div class="stat-label">Pendências Financeiras</div>
    </div>
  `;
}

// ─── Matrículas ───────────────────────────────────────────────────────────────

function _renderMatriculas(mats) {
  if (!mats.length) {
    document.getElementById('mat-body').innerHTML = _emptyState('Nenhuma matrícula encontrada.');
    return;
  }

  document.getElementById('mat-body').innerHTML = `
    <table>
      <thead><tr><th>Curso</th><th>Turma</th><th>Período</th><th>Status</th></tr></thead>
      <tbody>
        ${mats.map(m => `
          <tr>
            <td><strong>${esc(m.curso?.nome ?? '—')}</strong></td>
            <td>${m.turma ? esc(m.turma.codigo) : '<span style="color:var(--text-tertiary)">Aguardando</span>'}</td>
            <td style="font-size:12px;color:var(--text-secondary)">
              ${m.turma?.data_inicio ? fmtDate(m.turma.data_inicio) : '—'}
              ${m.turma?.data_fim ? ' → ' + fmtDate(m.turma.data_fim) : ''}
            </td>
            <td>${badge(MAT_BADGE, m.status)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

// ─── Certificados ─────────────────────────────────────────────────────────────

function _renderCertificados(certs) {
  if (!certs.length) {
    document.getElementById('certs-body').innerHTML = _emptyState('Nenhum certificado emitido ainda.');
    return;
  }

  const verifyBase = `${SUPABASE_URL}/functions/v1/verificar-certificado?codigo=`;

  document.getElementById('certs-body').innerHTML = `
    <table>
      <thead><tr><th>Curso</th><th>Emissão</th><th>Validade</th><th>Status</th><th>Verificar</th></tr></thead>
      <tbody>
        ${certs.map(c => `
          <tr>
            <td><strong>${esc(c.curso?.nome ?? '—')}</strong></td>
            <td style="font-size:12px">${fmtDate(c.data_emissao)}</td>
            <td style="font-size:12px">${c.data_validade ? fmtDate(c.data_validade) : 'Vitalício'}</td>
            <td>${badge(CERT_BADGE, c.status)}</td>
            <td>
              <a href="${verifyBase}${encodeURIComponent(c.codigo_verificacao)}"
                 target="_blank" rel="noopener"
                 style="font-family:var(--font-mono);font-size:10px;color:var(--accent);text-decoration:none"
                 title="Verificar certificado publicamente">
                ${esc(c.codigo_verificacao)}
              </a>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

// ─── Pagamentos ───────────────────────────────────────────────────────────────

function _renderPagamentos(pags) {
  if (!pags.length) {
    document.getElementById('pag-body').innerHTML = _emptyState('Nenhum pagamento registrado.');
    return;
  }

  document.getElementById('pag-body').innerHTML = `
    <table>
      <thead><tr><th>Curso</th><th>Valor</th><th>Vencimento</th><th>Pagamento</th><th>Forma</th><th>Status</th></tr></thead>
      <tbody>
        ${pags.map(p => `
          <tr>
            <td>${esc(p.curso?.nome ?? '—')}</td>
            <td><strong>${fmtMoney(p.valor)}</strong></td>
            <td style="font-size:12px;${p.status === 'atraso' ? 'color:var(--red)' : ''}">${fmtDate(p.data_vencimento)}</td>
            <td style="font-size:12px;color:var(--text-secondary)">${p.data_pagamento ? fmtDate(p.data_pagamento) : '—'}</td>
            <td style="font-size:12px;color:var(--text-secondary)">${p.tipo_pagamento ?? '—'}</td>
            <td>${badge(PAG_BADGE, p.status)}</td>
          </tr>`).join('')}
      </tbody>
    </table>
  `;
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function _emptyState(msg) {
  return `
    <div style="text-align:center;padding:32px 16px;color:var(--text-tertiary);font-size:13px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
           width="32" height="32" style="opacity:.35;display:block;margin:0 auto 8px">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      ${esc(msg)}
    </div>`;
}
