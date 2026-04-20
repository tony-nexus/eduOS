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

// ─── Toast (toast-anchor-main embedded) ──────────────────────────────────────
export { toast } from './toast.js';

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
