/**
 * /js/ui/date-picker.js
 * Wrapper do EssealDatePicker adaptado aos 4 temas do HLV EduOS.
 *
 * - CSS variables em vez de cores hardcoded
 * - Locale pt-BR, formato YYYY-MM-DD (compatível com Supabase)
 * - Registro global via window.__hlvDatePickers para cleanup automático
 */

import EssealDatePicker from '../../esseal-date-picker-main/index.js';

let _styleInjected = false;

function _injectThemeOverride() {
  if (_styleInjected) return;
  _styleInjected = true;

  const style = document.createElement('style');
  style.id = 'esseal-dp-hlv-theme';
  style.textContent = `
    .dp-container {
      background: var(--bg-elevated) !important;
      border: 1px solid var(--border-default) !important;
      color: var(--text-primary) !important;
      box-shadow: 0 16px 40px rgba(0,0,0,.45), 0 0 0 1px var(--border-subtle) !important;
      border-radius: 10px !important;
      font-family: system-ui, -apple-system, sans-serif !important;
    }
    .dp-nav-btn {
      color: var(--text-secondary) !important;
      border-radius: 6px !important;
    }
    .dp-nav-btn:hover {
      background: var(--bg-hover) !important;
      color: var(--text-primary) !important;
    }
    .dp-title {
      color: var(--text-primary) !important;
      font-size: 13px !important;
      border-radius: 6px !important;
    }
    .dp-title:hover { background: var(--bg-hover) !important; }
    .dp-label {
      color: var(--text-tertiary) !important;
      font-size: 10.5px !important;
      font-weight: 600 !important;
      letter-spacing: .05em;
    }
    .dp-cell { font-size: 12.5px !important; border-radius: 6px !important; }
    .dp-cell:not(.dp-label):not(.dp-disabled):hover {
      background: var(--bg-hover) !important;
    }
    .dp-other-month { color: var(--text-tertiary) !important; opacity: .35; }
    .dp-disabled { color: var(--text-tertiary) !important; }
    .dp-footer { border-top-color: var(--border-subtle) !important; }
    .dp-btn-cancel {
      background: var(--bg-overlay) !important;
      color: var(--text-secondary) !important;
      border-color: var(--border-default) !important;
    }
    .dp-btn-cancel:hover { background: var(--bg-active) !important; }
    .dp-input { cursor: pointer !important; }
    .dp-input:focus { outline: 2px solid var(--accent) !important; outline-offset: 2px; }
  `;
  document.head.appendChild(style);
}

function _accentHex() {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--accent').trim() || '#63ffab';
}

function _textPrimary() {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--text-primary').trim() || '#ffffff';
}

function _registry() {
  if (!window.__hlvDatePickers) window.__hlvDatePickers = [];
  return window.__hlvDatePickers;
}

/**
 * Cria um EssealDatePicker integrado ao tema HLV atual.
 * @param {HTMLInputElement} el
 * @param {Object} [opts] – opções extras (minDate, maxDate, onChange, etc.)
 * @returns {EssealDatePicker}
 */
export function initDatePicker(el, opts = {}) {
  if (!el) return null;
  _injectThemeOverride();

  const picker = new EssealDatePicker(el, {
    locale: 'pt-BR',
    format: date => date.toLocaleDateString('en-CA'), // YYYY-MM-DD
    primaryColor: _accentHex(),
    textColor: _textPrimary(),
    zIndex: 10500,
    ...opts,
  });

  // Pré-posiciona calendário na data já preenchida no input
  if (el.value) {
    const d = new Date(el.value + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      picker.state.viewDate  = new Date(d);
      picker.state.selectedDate = d;
    }
  }

  _registry().push(picker);
  return picker;
}

/**
 * Destrói todos os pickers do registro global.
 * Chamado automaticamente pelo closeModal() em components.js.
 */
export function destroyAllPickers() {
  _registry().forEach(p => { try { p.destroy(); } catch {} });
  window.__hlvDatePickers = [];
}
