/**
 * /js/ui/components.js
 * Helpers de UI: Modal, Toast, setContent, formatters.
 *
 * CORREÇÕES APLICADAS:
 *  - fmtDate() corrigido para timezone BR (evita off-by-one em UTC-3)
 *  - toast() com guard t.isConnected antes de remover (evita erro pós-navegação)
 *  - esc() helper de escape HTML para prevenir XSS nos modais
 */

// ─── XSS escape ───────────────────────────────────────────────────────────────
export function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function openModal(title, bodyHTML, wide = false) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML    = bodyHTML;
  const modal = document.getElementById('modal-content');
  modal.style.width    = wide ? '760px' : '600px';
  modal.style.maxWidth = 'calc(100vw - 32px)';
  document.getElementById('modal-backdrop').classList.add('open');
}

export function closeModal() {
  document.getElementById('modal-backdrop').classList.remove('open');
  // Destrói date pickers registrados (evita acúmulo de DOM e listeners)
  (window.__hlvDatePickers || []).forEach(p => { try { p.destroy(); } catch {} });
  window.__hlvDatePickers = [];
}

// ─── Toast ────────────────────────────────────────────────────────────────────
const TOAST_ICONS = {
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  error:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  info:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
};

export function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = (TOAST_ICONS[type] ?? TOAST_ICONS.info) + `<span>${esc(msg)}</span>`;
  document.getElementById('toast-container').appendChild(t);

  setTimeout(() => {
    t.style.opacity   = '0';
    t.style.transform = 'translateX(20px)';
    t.style.transition = '0.3s';
    // CORREÇÃO: guard isConnected antes de remove()
    setTimeout(() => { if (t.isConnected) t.remove(); }, 300);
  }, 3000);
}

// ─── Content injection ────────────────────────────────────────────────────────
export function setContent(html) {
  document.getElementById('main-content').innerHTML = html;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
export function fmtMoney(v) {
  return 'R$\u00a0' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

/**
 * CORREÇÃO: fmtDate() sem erro de timezone.
 * new Date('2025-01-15') interpreta como UTC 00:00, que em BRT (UTC-3)
 * se torna 2025-01-14 23:00. Construção manual evita esse off-by-one.
 */
export function fmtDate(d) {
  if (!d) return '—';
  // Suporte a strings ISO e objetos Date
  if (typeof d === 'string' && d.length === 10) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('pt-BR');
  }
  return new Date(d).toLocaleDateString('pt-BR');
}

export function randInt(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
