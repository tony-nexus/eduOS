/**
 * /js/views/relatorios.js
 */

import { setContent, toast } from '../ui/components.js';

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, toast, fmtMoney } from '../ui/components.js';

let _pagamentos = [];
let _matriculas = [];
let _turmas = [];
let _certificados = [];

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Relatórios</h1><p>Análise e Business Intelligence em Tempo Real</p></div>
      <div class="page-header-actions">
        <select class="select-input" id="filtro-periodo">
          <option value="30">Últimos 30 dias</option>
          <option value="m">Este mês</option>
          <option value="t">Este trimestre</option>
          <option value="y">Este ano</option>
          <option value="all">Todo o período</option>
        </select>
      </div>
    </div>
    <div id="relatorios-dashboard" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
      <div style="padding:60px;grid-column:1/-1;text-align:center;color:var(--text-tertiary)">
        <div class="skeleton" style="width:24px;height:24px;border-radius:50%;display:inline-block"></div>
        <div style="margin-top:10px">Carregando dados na nuvem...</div>
      </div>
    </div>
  `);

  document.getElementById('filtro-periodo')?.addEventListener('change', (e) => buildDashboard(e.target.value));
  await loadData();
}

async function loadData() {
  try {
    const t = getTenantId();
    const [pRes, mRes, tRes, cRes] = await Promise.all([
      supabase.from('pagamentos').select('valor, status, data_pagamento, data_vencimento').eq('tenant_id', t),
      supabase.from('matriculas').select('status, data_matricula').eq('tenant_id', t),
      supabase.from('turmas').select('vagas, ocupadas, data_inicio').eq('tenant_id', t),
      supabase.from('certificados').select('status, data_emissao').eq('tenant_id', t)
    ]);
    _pagamentos = pRes.data || [];
    _matriculas = mRes.data || [];
    _turmas = tRes.data || [];
    _certificados = cRes.data || [];
  } catch(e) { console.error('Erro Relatórios:', e); }
  
  buildDashboard(document.getElementById('filtro-periodo')?.value || '30');
}

function buildDashboard(periodo) {
  let startData = new Date();
  if (periodo === '30') startData.setDate(startData.getDate() - 30);
  else if (periodo === 'm') startData.setDate(1);
  else if (periodo === 't') startData.setMonth(startData.getMonth() - 2, 1);
  else if (periodo === 'y') startData.setMonth(0, 1);
  else startData = new Date(2000, 0, 1);
  
  const isoStart = startData.toISOString().split('T')[0];
  
  const pagFiltered = _pagamentos.filter(p => (p.data_pagamento || p.data_vencimento || '2999-01-01') >= isoStart);
  const matFiltered = _matriculas.filter(m => (m.data_matricula || '2999-01-01') >= isoStart);
  const turFiltered = _turmas.filter(t => (t.data_inicio || '2999-01-01') >= isoStart);
  const certFiltered= _certificados.filter(c => (c.data_emissao || '2999-01-01') >= isoStart);

  let receita = 0, inadimplencia = 0;
  pagFiltered.forEach(p => {
    if (p.status === 'recebido') receita += Number(p.valor || 0);
    if (p.status === 'atraso') inadimplencia += Number(p.valor || 0);
  });
  
  const concluidos = matFiltered.filter(m => m.status === 'concluido' || m.status === 'certificado_emitido').length;
  const taxaConclusao = matFiltered.length > 0 ? Math.round((concluidos/matFiltered.length)*100) : 0;
  
  let vagasTot = 0, ocupadasTot = 0;
  turFiltered.forEach(t => { vagasTot += (t.vagas||0); ocupadasTot += (t.ocupadas||0); });
  const taxaOcupacao = vagasTot > 0 ? Math.round((ocupadasTot/vagasTot)*100) : 0;

  const validos = certFiltered.filter(c => c.status === 'valido').length;
  
  const cardsData = [
    { titulo:'Receita do Período', desc:`${fmtMoney(receita)}`, cor:'var(--green)' },
    { titulo:'Novas Matrículas', desc:`${matFiltered.length} matrículas`, cor:'var(--blue)' },
    { titulo:'Inadimplência', desc:`${fmtMoney(inadimplencia)}`, cor:'var(--red)' },
    { titulo:'Taxa de Conclusão', desc:`${taxaConclusao}% concluídos`, cor:'var(--accent)' },
    { titulo:'Ocupação de Turmas', desc:`${taxaOcupacao}% das vagas ocupadas`, cor:'var(--purple)' },
    { titulo:'Certificados Emitidos', desc:`${validos} válidos no período`, cor:'var(--amber)' },
  ];

  document.getElementById('relatorios-dashboard').innerHTML = cardsData.map(c => `
    <div class="card" style="padding:22px;border: 1px solid var(--border-color);border-radius:12px">
      <div style="width:44px;height:44px;border-radius:10px;background:${c.cor}1a;display:grid;place-items:center;margin-bottom:16px;color:${c.cor}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
          ${c.titulo.includes('Receita')     ? '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' :
            c.titulo.includes('Matrículas')  ? '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>' :
            c.titulo.includes('Inadimplência')? '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/>' :
            '<polyline points="20 6 9 17 4 12"/>'}
        </svg>
      </div>
      <div style="font-weight:600;font-size:13px;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">${c.titulo}</div>
      <div style="font-size:26px;font-weight:700;color:var(--text-primary);letter-spacing:-0.5px">${c.desc}</div>
    </div>
  `).join('');
}
