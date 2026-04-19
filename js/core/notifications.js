/**
 * notifications.js — Intelligent bell agent.
 * Queries Supabase for real-time alerts every 5 minutes.
 * Bell toggle is wired in init.js (always active, no auth dependency).
 */

import { supabase, getTenantId } from './supabase.js';
import { toast } from '../ui/toast.js';

const REFRESH_MS = 5 * 60 * 1000;

let _alerts       = [];
let _readIds      = _safeSet(localStorage,  'notif_read');
let _knownIds     = _safeSet(sessionStorage, 'notif_known');
let _refreshTimer = null;
let _initialized  = false;

function _safeSet(storage, key) {
  try { return new Set(JSON.parse(storage.getItem(key) || '[]')); }
  catch { return new Set(); }
}

// ── Public init (called once after login) ─────────────────────────────────────
export function initNotifications() {
  if (_initialized) return;
  _initialized = true;
  _refresh();
  _refreshTimer = setInterval(_refresh, REFRESH_MS);
}

// ── Exposed to init.js for panel render & mark-all ────────────────────────────
export function renderPanel() { _render(); }
export function markAllRead() {
  _alerts.forEach(a => _readIds.add(a.id));
  localStorage.setItem('notif_read', JSON.stringify([..._readIds]));
  _updateDot();
  _render();
}

// ── Data fetch ────────────────────────────────────────────────────────────────
async function _refresh() {
  try {
    const tid     = getTenantId();
    const today   = new Date();
    const todayStr = today.toLocaleDateString('en-CA');

    const in3  = new Date(today); in3.setDate(in3.getDate() + 3);
    const in7  = new Date(today); in7.setDate(in7.getDate() + 7);
    const in3s = in3.toLocaleDateString('en-CA');
    const in7s = in7.toLocaleDateString('en-CA');

    _alerts = [];

    // 1. Pagamentos vencidos
    const { data: overdue } = await supabase
      .from('financeiro')
      .select('id, descricao, vencimento, aluno:aluno_id(nome)')
      .eq('tenant_id', tid)
      .eq('status', 'pendente')
      .lt('vencimento', todayStr)
      .order('vencimento');

    (overdue || []).forEach(p => _alerts.push({
      id:    `pay_over_${p.id}`,
      type:  'error',
      icon:  '💸',
      title: 'Pagamento vencido',
      body:  `${p.aluno?.nome || 'Aluno'} — ${_fmtDate(p.vencimento)}`,
    }));

    // 2. Pagamentos vencendo em 3 dias
    const { data: dueSoon } = await supabase
      .from('financeiro')
      .select('id, descricao, vencimento, aluno:aluno_id(nome)')
      .eq('tenant_id', tid)
      .eq('status', 'pendente')
      .gte('vencimento', todayStr)
      .lte('vencimento', in3s)
      .order('vencimento');

    (dueSoon || []).forEach(p => _alerts.push({
      id:    `pay_soon_${p.id}`,
      type:  'warning',
      icon:  '⏰',
      title: 'Pagamento próximo',
      body:  `${p.aluno?.nome || 'Aluno'} — ${_fmtDate(p.vencimento)}`,
    }));

    // 3. Certificados vencendo em 7 dias
    const { data: certExpiring } = await supabase
      .from('certificados')
      .select('id, codigo, validade, aluno:aluno_id(nome), curso:curso_id(nome)')
      .eq('tenant_id', tid)
      .not('validade', 'is', null)
      .gte('validade', todayStr)
      .lte('validade', in7s)
      .order('validade');

    (certExpiring || []).forEach(c => _alerts.push({
      id:    `cert_${c.id}`,
      type:  'warning',
      icon:  '📜',
      title: 'Certificado vencendo',
      body:  `${c.aluno?.nome || '—'} · ${c.curso?.nome || '—'} — ${_fmtDate(c.validade)}`,
    }));

    // 4. Turmas iniciando em 3 dias
    const { data: turmasStart } = await supabase
      .from('turmas')
      .select('id, nome, data_inicio')
      .eq('tenant_id', tid)
      .eq('status', 'planejada')
      .gte('data_inicio', todayStr)
      .lte('data_inicio', in3s)
      .order('data_inicio');

    (turmasStart || []).forEach(t => _alerts.push({
      id:    `turma_start_${t.id}`,
      type:  'info',
      icon:  '🎓',
      title: 'Turma iniciando em breve',
      body:  `${t.nome} — ${_fmtDate(t.data_inicio)}`,
    }));

    // 5. Turmas encerrando em 3 dias
    const { data: turmasEnd } = await supabase
      .from('turmas')
      .select('id, nome, data_fim')
      .eq('tenant_id', tid)
      .eq('status', 'em_andamento')
      .gte('data_fim', todayStr)
      .lte('data_fim', in3s)
      .order('data_fim');

    (turmasEnd || []).forEach(t => _alerts.push({
      id:    `turma_end_${t.id}`,
      type:  'warning',
      icon:  '🏁',
      title: 'Turma encerrando em breve',
      body:  `${t.nome} — ${_fmtDate(t.data_fim)}`,
    }));

    // Toast sound for truly new alerts (not seen in this session)
    const trulyNew = _alerts.filter(a => !_knownIds.has(a.id) && !_readIds.has(a.id));
    trulyNew.slice(0, 3).forEach(a => {
      toast[a.type === 'error' ? 'error' : a.type === 'warning' ? 'warning' : 'info'](
        `${a.icon} ${a.title}`,
        { description: a.body, sound: true }
      );
    });
    _alerts.forEach(a => _knownIds.add(a.id));
    sessionStorage.setItem('notif_known', JSON.stringify([..._knownIds]));

    _updateDot();

    // Re-render if panel is open
    const panel = document.getElementById('notif-panel');
    if (panel && panel.style.display !== 'none') _render();

  } catch (err) {
    console.error('[notif]', err);
  }
}

// ── Render panel ──────────────────────────────────────────────────────────────
function _render() {
  const list  = document.getElementById('notif-list');
  const empty = document.getElementById('notif-empty');
  if (!list) return;

  const unread = _alerts.filter(a => !_readIds.has(a.id));
  const read   = _alerts.filter(a =>  _readIds.has(a.id));
  const sorted = [...unread, ...read];

  if (!sorted.length) {
    list.innerHTML = '';
    list.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';
  list.style.display = '';

  const COLOR = {
    error:   'var(--red,#ef4444)',
    warning: 'var(--amber,#f59e0b)',
    info:    'var(--blue,#3b82f6)',
    success: 'var(--green,#10b981)',
  };

  list.innerHTML = sorted.map(a => {
    const isRead = _readIds.has(a.id);
    const dot    = !isRead ? `<span style="width:7px;height:7px;border-radius:50%;background:${COLOR[a.type]};flex-shrink:0;display:inline-block;margin-left:4px"></span>` : '';
    const rowBg  = isRead ? '' : 'background:var(--bg-hover,rgba(255,255,255,0.04));';
    return `
      <div class="notif-item" data-nid="${a.id}" style="display:flex;align-items:flex-start;gap:10px;padding:11px 16px;cursor:pointer;border-bottom:1px solid var(--border-subtle,rgba(255,255,255,0.05));${rowBg}transition:background 0.15s">
        <div style="font-size:18px;line-height:1.3;flex-shrink:0">${a.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center">
            <span style="font-size:12.5px;font-weight:700;color:var(--text-primary)">${a.title}</span>
            ${dot}
          </div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.body}</div>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', () => {
      _readIds.add(el.dataset.nid);
      localStorage.setItem('notif_read', JSON.stringify([..._readIds]));
      _updateDot();
      _render();
    });
  });
}

// ── Dot badge ─────────────────────────────────────────────────────────────────
function _updateDot() {
  const dot    = document.getElementById('notif-dot');
  const unread = _alerts.filter(a => !_readIds.has(a.id)).length;
  if (!dot) return;
  dot.style.display = unread > 0 ? '' : 'none';
}

// ── Helper ────────────────────────────────────────────────────────────────────
function _fmtDate(d) {
  if (!d) return '—';
  if (typeof d === 'string' && d.length === 10) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('pt-BR');
  }
  return new Date(d).toLocaleDateString('pt-BR');
}
