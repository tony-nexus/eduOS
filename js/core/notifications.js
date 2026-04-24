/**
 * notifications.js — Intelligent bell agent.
 * Queries Supabase for real-time alerts every 5 minutes.
 * Bell toggle is wired in init.js (always active, no auth dependency).
 */

import { supabase, getTenantId } from './supabase.js';
import { toast, getSoundEnabled, setSoundEnabled } from '../ui/toast.js';
import { navigate } from './router.js';

const REFRESH_MS = 5 * 60 * 1000;

let _alerts        = [];
let _readIds       = _safeSet(localStorage,  'notif_read');
let _knownIds      = _safeSet(sessionStorage, 'notif_known');
let _dismissedIds  = _safeSet(localStorage,  'notif_dismissed');
let _refreshTimer  = null;
let _initialized   = false;

// ── Lucide SVG icons ──────────────────────────────────────────────────────────
const _SVG = {
  alertCircle:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  clock:         `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  fileText:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  triangleAlert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  calendar:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  flag:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
  bellRing:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M4 2C2.8 3.7 2 5.7 2 8"/><path d="M20 2c1.2 1.7 2 3.7 2 8"/></svg>`,
  xSmall:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="11" height="11"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

function _alertIcon(nid) {
  if (nid.startsWith('pay_over_'))     return _SVG.alertCircle;
  if (nid.startsWith('pay_soon_'))     return _SVG.clock;
  if (nid.startsWith('cert_'))         return _SVG.fileText;
  if (nid.startsWith('turma_amanha_')) return _SVG.triangleAlert;
  if (nid.startsWith('turma_start_'))  return _SVG.calendar;
  if (nid.startsWith('turma_end_'))    return _SVG.flag;
  if (nid.startsWith('renov_'))        return _SVG.bellRing;
  return _SVG.alertCircle;
}

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

// ── Exposed to init.js ────────────────────────────────────────────────────────
export function renderPanel() { _render(); }

export function markAllRead() {
  _alerts.forEach(a => _readIds.add(a.id));
  localStorage.setItem('notif_read', JSON.stringify([..._readIds]));
  _updateDot();
  _render();
}

export function clearAllNotifs() {
  _alerts.forEach(a => {
    _dismissedIds.add(a.id);
    _readIds.add(a.id);
  });
  localStorage.setItem('notif_dismissed', JSON.stringify([..._dismissedIds]));
  localStorage.setItem('notif_read', JSON.stringify([..._readIds]));
  _updateDot();
  _render();
}

export function toggleSound() {
  const next = !getSoundEnabled();
  setSoundEnabled(next);
  _updateSoundBtn();
  toast(next ? 'Som de notificações ativado' : 'Som de notificações desativado', next ? 'success' : 'info', { sound: next });
}

export { getSoundEnabled };

// ── Data fetch ────────────────────────────────────────────────────────────────
async function _refresh() {
  try {
    const tid      = getTenantId();
    const today    = new Date();
    const todayStr = today.toLocaleDateString('en-CA');

    const in1  = new Date(today); in1.setDate(in1.getDate() + 1);
    const in3  = new Date(today); in3.setDate(in3.getDate() + 3);
    const in7  = new Date(today); in7.setDate(in7.getDate() + 7);
    const in1s = in1.toLocaleDateString('en-CA');
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

    // 4. Turma começando amanhã — alerta urgente (1 dia)
    const { data: turmasAmanha } = await supabase
      .from('turmas')
      .select('id, codigo, data_inicio')
      .eq('tenant_id', tid)
      .in('status', ['agendada', 'planejada'])
      .eq('data_inicio', in1s)
      .order('data_inicio');

    (turmasAmanha || []).forEach(t => _alerts.push({
      id:    `turma_amanha_${t.id}`,
      type:  'warning',
      icon:  '⚠️',
      title: 'Turma começa amanhã!',
      body:  `Turma ${t.codigo || '—'} — ${_fmtDate(t.data_inicio)}`,
    }));

    // 5. Turmas iniciando em 3 dias
    const { data: turmasStart } = await supabase
      .from('turmas')
      .select('id, codigo, data_inicio')
      .eq('tenant_id', tid)
      .in('status', ['agendada', 'planejada'])
      .gte('data_inicio', todayStr)
      .lte('data_inicio', in3s)
      .order('data_inicio');

    (turmasStart || []).forEach(t => _alerts.push({
      id:    `turma_start_${t.id}`,
      type:  'info',
      icon:  '🎓',
      title: 'Turma iniciando em breve',
      body:  `Turma ${t.codigo || '—'} — ${_fmtDate(t.data_inicio)}`,
    }));

    // 6. Turmas encerrando em 3 dias
    const { data: turmasEnd } = await supabase
      .from('turmas')
      .select('id, codigo, data_fim')
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
      body:  `Turma ${t.codigo || '—'} — ${_fmtDate(t.data_fim)}`,
    }));

    // 6. Alertas de renovação: certs vencidos/críticos sem contato confirmado
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
    const in30s = in30.toLocaleDateString('en-CA');

    const { data: renovPendentes } = await supabase
      .from('certificados')
      .select('id, data_validade, aluno:aluno_id(nome), curso:curso_id(nome)')
      .eq('tenant_id', tid)
      .not('data_validade', 'is', null)
      .lte('data_validade', in30s)
      .eq('contato_confirmado', false);

    (renovPendentes || []).forEach(c => {
      const dias    = Math.round((new Date(c.data_validade) - new Date()) / (1000*60*60*24));
      const vencido = dias < 0;
      _alerts.push({
        id:    `renov_${c.id}`,
        type:  vencido ? 'error' : 'warning',
        icon:  '🔔',
        title: vencido ? 'Renovação urgente — contato pendente' : 'Alerta de renovação — contato pendente',
        body:  `${c.aluno?.nome || '—'} · ${c.curso?.nome || '—'} — ${vencido ? `venceu há ${Math.abs(dias)}d` : `vence em ${dias}d`}`,
      });
    });

    // Toast apenas para alertas verdadeiramente novos nesta sessão
    const trulyNew = _alerts.filter(a => !_knownIds.has(a.id) && !_readIds.has(a.id));
    trulyNew.slice(0, 3).forEach(a => {
      toast[a.type === 'error' ? 'error' : a.type === 'warning' ? 'warning' : 'info'](
        a.title,
        { description: a.body, sound: true }
      );
    });
    _alerts.forEach(a => _knownIds.add(a.id));
    sessionStorage.setItem('notif_known', JSON.stringify([..._knownIds]));

    _updateDot();

    // Re-render se painel estiver aberto
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
  const count = document.getElementById('notif-count');
  if (!list) return;

  const visible = _alerts.filter(a => !_dismissedIds.has(a.id));
  const unread  = visible.filter(a => !_readIds.has(a.id));
  const read    = visible.filter(a =>  _readIds.has(a.id));
  const sorted  = [...unread, ...read];

  if (count) {
    count.textContent   = unread.length > 0 ? String(unread.length > 9 ? '9+' : unread.length) : '';
    count.style.display = unread.length > 0 ? '' : 'none';
  }

  _updateSoundBtn();

  if (!sorted.length) {
    list.innerHTML = '';
    list.style.display = 'none';
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';
  list.style.display = '';

  const ACCENT = { error: '#ef4444', warning: '#f59e0b', info: '#5b8af0', success: '#10b981' };

  list.innerHTML = sorted.map(a => {
    const isRead = _readIds.has(a.id);
    const accent = ACCENT[a.type] || ACCENT.info;
    return `<div class="notif-item${isRead ? ' is-read' : ''}" data-nid="${a.id}" style="position:relative">
      <div class="notif-item-accent" style="background:${accent}"></div>
      <div class="notif-item-icon" style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:color-mix(in srgb,${accent} 12%,transparent);color:${accent};flex-shrink:0">
        ${_alertIcon(a.id)}
      </div>
      <div class="notif-item-body">
        <div class="notif-item-title">${a.title}</div>
        <div class="notif-item-sub">${a.body}</div>
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0">
        <div class="notif-item-dot" style="background:${accent};${isRead ? 'opacity:0' : ''}"></div>
        <button class="notif-dismiss-btn" data-nid="${a.id}"
          title="Remover notificação"
          style="background:none;border:none;cursor:pointer;padding:3px;border-radius:4px;
                 color:var(--text-tertiary);display:flex;align-items:center;justify-content:center;
                 opacity:0;transition:opacity .15s"
          aria-label="Remover notificação">
          ${_SVG.xSmall}
        </button>
      </div>
    </div>`;
  }).join('');

  // Mostrar X ao hover no item
  list.querySelectorAll('.notif-item').forEach(el => {
    const xBtn = el.querySelector('.notif-dismiss-btn');
    el.addEventListener('mouseenter', () => { if (xBtn) xBtn.style.opacity = '1'; });
    el.addEventListener('mouseleave', () => { if (xBtn) xBtn.style.opacity = '0'; });
  });

  // Dismiss individual
  list.querySelectorAll('.notif-dismiss-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const nid = btn.dataset.nid;
      _dismissedIds.add(nid);
      _readIds.add(nid);
      localStorage.setItem('notif_dismissed', JSON.stringify([..._dismissedIds]));
      localStorage.setItem('notif_read',      JSON.stringify([..._readIds]));
      _updateDot();
      _render();
    });
  });

  // Click no item — navegar
  list.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.notif-dismiss-btn')) return;
      const nid = el.dataset.nid;
      _readIds.add(nid);
      localStorage.setItem('notif_read', JSON.stringify([..._readIds]));
      _updateDot();
      _render();

      const panel = document.getElementById('notif-panel');
      if (panel) panel.style.display = 'none';

      if (nid.startsWith('renov_')) {
        window.__pendingAction = { type: 'renovacao_detail', certId: nid.replace('renov_', '') };
        navigate('renovacoes');
      } else if (nid.startsWith('pay_')) {
        navigate('financeiro');
      } else if (nid.startsWith('cert_')) {
        navigate('certificados');
      } else if (nid.startsWith('turma_')) {
        navigate('turmas');
      }
    });
  });
}

// ── Sound button ──────────────────────────────────────────────────────────────
function _updateSoundBtn() {
  const btn = document.getElementById('notif-sound-toggle');
  if (!btn) return;
  const on = getSoundEnabled();
  btn.title = on ? 'Som ativado — clique para silenciar' : 'Som desativado — clique para ativar';
  btn.innerHTML = on
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
  btn.style.opacity = on ? '1' : '0.5';
}

// ── Dot badge ─────────────────────────────────────────────────────────────────
function _updateDot() {
  const dot    = document.getElementById('notif-dot');
  const unread = _alerts.filter(a => !_readIds.has(a.id) && !_dismissedIds.has(a.id)).length;
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
