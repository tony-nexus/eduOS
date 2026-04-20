/**
 * notifications.js — Intelligent bell agent.
 * Queries Supabase for real-time alerts every 5 minutes.
 * Bell toggle is wired in init.js (always active, no auth dependency).
 */

import { supabase, getTenantId } from './supabase.js';
import { toast, getSoundEnabled, setSoundEnabled } from '../ui/toast.js';

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

// ── Exposed to init.js ────────────────────────────────────────────────────────
export function renderPanel() { _render(); }

export function markAllRead() {
  _alerts.forEach(a => _readIds.add(a.id));
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

    // Toast apenas para alertas verdadeiramente novos nesta sessão
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

  const unread = _alerts.filter(a => !_readIds.has(a.id));
  const read   = _alerts.filter(a =>  _readIds.has(a.id));
  const sorted = [...unread, ...read];

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
    return `<div class="notif-item${isRead ? ' is-read' : ''}" data-nid="${a.id}">
      <div class="notif-item-accent" style="background:${accent}"></div>
      <div class="notif-item-emoji">${a.icon}</div>
      <div class="notif-item-body">
        <div class="notif-item-title">${a.title}</div>
        <div class="notif-item-sub">${a.body}</div>
      </div>
      <div class="notif-item-dot" style="background:${accent};${isRead ? 'opacity:0' : ''}"></div>
    </div>`;
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
