/**
 * /js/ui/date-picker.js
 * EssealDatePicker v3.0.0 — HLV EduOS
 *
 * Digitação + calendário estilo Power BI:
 * - Digitação livre com máscara DD/MM/AAAA
 * - Converte para YYYY-MM-DD no input.value (compatível Supabase)
 * - Calendário sincroniza em tempo real enquanto o usuário digita
 * - Ao focar: converte YYYY-MM-DD → DD/MM/AAAA para exibição
 * - Ao sair: valida e normaliza de volta para YYYY-MM-DD
 */

// ─── EssealDatePicker v3.0.0 ─────────────────────────────────────────────────
class EssealDatePicker {
  constructor(target, options = {}) {
    this.input = typeof target === 'string' ? document.querySelector(target) : target;
    if (!this.input) throw new Error('EssealDatePicker: Target input not found.');

    this.options = {
      mode: 'single',
      locale: 'pt-BR',
      minDate: null,
      maxDate: null,
      primaryColor: '#3b82f6',
      textColor: '#1f2937',
      zIndex: 9999,
      format: (date) => date.toLocaleDateString('en-CA'), // YYYY-MM-DD
      onChange: null,
      showActions: false,
      ...options,
    };

    this.state = {
      viewDate: new Date(),
      selectedDate: null,
      pendingDate: null,
      rangeStart: null,
      rangeEnd: null,
      isVisible: false,
      view: 'day',
    };

    this._suppressInput = false;

    if (this.options.minDate) this.options.minDate = this._normalizeDate(this.options.minDate);
    if (this.options.maxDate) this.options.maxDate = this._normalizeDate(this.options.maxDate);

    this._handleInputFocus    = this._handleInputFocus.bind(this);
    this._handleInputKeydown  = this._handleInputKeydown.bind(this);
    this._handleInputTyped    = this._handleInputTyped.bind(this);
    this._handleInputBlur     = this._handleInputBlur.bind(this);
    this._handleDocumentClick = this._handleDocumentClick.bind(this);
    this._handleResize        = this._handleResize.bind(this);

    this._init();
  }

  _init() {
    // Remove readonly — permite digitação
    this.input.removeAttribute('readonly');
    this.input.setAttribute('autocomplete', 'off');
    this.input.setAttribute('spellcheck', 'false');
    this.input.placeholder = 'DD/MM/AAAA';

    this._injectStyles();
    this._createDOM();
    this._attachListeners();
  }

  _injectStyles() {
    const styleId = 'esseal-datepicker-styles';
    if (document.getElementById(styleId)) return;
    const css = `
      .dp-container {
        position: fixed; background: #fff; border: 1px solid #e5e7eb;
        border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,.1);
        font-family: system-ui,-apple-system,sans-serif; width: 280px;
        padding: 16px; display: none; z-index: ${this.options.zIndex};
        color: ${this.options.textColor}; user-select: none;
      }
      .dp-container.dp-visible { display: block; }
      .dp-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
      .dp-nav-btn { background:none; border:none; cursor:pointer; padding:4px; border-radius:4px; color:inherit; }
      .dp-nav-btn:hover { background:#f3f4f6; }
      .dp-title { font-weight:600; cursor:pointer; padding:4px 8px; border-radius:4px; }
      .dp-title:hover { background:#f3f4f6; }
      .dp-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
      .dp-grid-wide { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
      .dp-cell { height:36px; display:flex; align-items:center; justify-content:center;
        font-size:.875rem; cursor:pointer; border-radius:4px; }
      .dp-label { font-size:.75rem; font-weight:500; color:#9ca3af; cursor:default; }
      .dp-cell:not(.dp-label):not(.dp-disabled):hover { background-color:#f3f4f6; }
      .dp-other-month { color:#d1d5db; }
      .dp-disabled { opacity:.3; cursor:not-allowed; text-decoration:line-through; }
      .dp-selected,.dp-range-start,.dp-range-end { color:#fff !important; }
      .dp-in-range { border-radius:0; }
      .dp-today { border:1px solid ${this.options.primaryColor}; }
      .dp-footer { display:flex; gap:8px; margin-top:12px; padding-top:12px; border-top:1px solid #e5e7eb; }
      .dp-btn { flex:1; padding:7px 0; border-radius:6px; font-size:.875rem; cursor:pointer; font-family:inherit; }
      .dp-btn-cancel { background:#f3f4f6; color:#374151; border:1px solid #e5e7eb; }
      .dp-btn-cancel:hover { background:#e5e7eb; }
      .dp-btn-confirm { color:#fff; border:none; }
      .dp-btn-confirm:hover { opacity:.88; }
    `;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
  }

  _createDOM() {
    this.root = document.createElement('div');
    this.root.className = 'dp-container';
    this.root.setAttribute('role', 'dialog');

    const header  = document.createElement('div');
    header.className = 'dp-header';
    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'dp-nav-btn'; prevBtn.dataset.action = 'prev'; prevBtn.innerHTML = '&lt;';
    const title   = document.createElement('span');
    title.className = 'dp-title'; title.dataset.action = 'switch-view';
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'dp-nav-btn'; nextBtn.dataset.action = 'next'; nextBtn.innerHTML = '&gt;';
    header.append(prevBtn, title, nextBtn);

    const body = document.createElement('div');
    body.className = 'dp-body';
    this.root.append(header, body);

    if (this.options.showActions) {
      const footer = document.createElement('div');
      footer.className = 'dp-footer';
      const cancelBtn  = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'dp-btn dp-btn-cancel'; cancelBtn.textContent = 'Cancelar'; cancelBtn.dataset.action = 'cancel';
      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = 'dp-btn dp-btn-confirm'; confirmBtn.textContent = 'Confirmar'; confirmBtn.dataset.action = 'confirm';
      confirmBtn.style.background = this.options.primaryColor;
      footer.append(cancelBtn, confirmBtn);
      this.root.appendChild(footer);
    }

    document.body.appendChild(this.root);

    // mousedown preventDefault evita que o input perca foco ao clicar no calendário
    this.root.addEventListener('mousedown', (e) => { e.preventDefault(); });

    this.root.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target.closest('[data-action]') || e.target.closest('.dp-cell');
      if (!target) return;
      if (target.dataset.action) {
        this._handleNavigation(target.dataset.action);
      } else if (target.classList.contains('dp-cell') &&
                 !target.classList.contains('dp-disabled') &&
                 !target.classList.contains('dp-label')) {
        this._handleSelection(target);
      }
    });
  }

  _attachListeners() {
    this.input.addEventListener('focus',   this._handleInputFocus);
    this.input.addEventListener('keydown', this._handleInputKeydown);
    this.input.addEventListener('input',   this._handleInputTyped);
    this.input.addEventListener('blur',    this._handleInputBlur);
    document.addEventListener('click',    this._handleDocumentClick);
    window.addEventListener('resize',     this._handleResize);
    window.addEventListener('scroll',     this._handleResize, true);
  }

  destroy() {
    this.root.remove();
    this.input.removeEventListener('focus',   this._handleInputFocus);
    this.input.removeEventListener('keydown', this._handleInputKeydown);
    this.input.removeEventListener('input',   this._handleInputTyped);
    this.input.removeEventListener('blur',    this._handleInputBlur);
    document.removeEventListener('click',    this._handleDocumentClick);
    window.removeEventListener('resize',     this._handleResize);
    window.removeEventListener('scroll',     this._handleResize, true);
  }

  // ─── Máscara DD/MM/AAAA ────────────────────────────────────────────────────

  _handleInputFocus() {
    // Ao focar: converte YYYY-MM-DD para DD/MM/AAAA (exibição amigável)
    const val = this.input.value;
    const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, y, m, d] = isoMatch;
      this._setRawDisplay(`${d}/${m}/${y}`);
    }
    if (!this.state.isVisible) this.open();
  }

  _handleInputKeydown(e) {
    // Permitir: teclas de controle, copiar, colar, etc.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (['Backspace', 'Delete', 'Tab', 'Enter', 'Escape',
         'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      if (e.key === 'Escape') { this.close(); return; }
      if (e.key === 'Enter')  { this._commitFromDisplay(); this.close(); return; }
      return;
    }
    // Bloqueia tudo que não é dígito ou /
    if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }

    // Limita a 10 caracteres (DD/MM/AAAA)
    const selStart = this.input.selectionStart;
    const selEnd   = this.input.selectionEnd;
    const raw = this.input.value.replace(/\//g, '');
    const digits = raw.length - (selEnd - selStart > 0 ? selEnd - selStart : 0);
    if (digits >= 8) { e.preventDefault(); }
  }

  _handleInputTyped() {
    if (this._suppressInput) return;

    const cursorPos = this.input.selectionStart;
    const raw = this.input.value.replace(/[^\d]/g, '').slice(0, 8);

    // Reconstrói máscara DD/MM/AAAA
    let masked = '';
    if (raw.length > 0) masked += raw.slice(0, 2);
    if (raw.length > 2) masked += '/' + raw.slice(2, 4);
    if (raw.length > 4) masked += '/' + raw.slice(4, 8);

    this._setRawDisplay(masked);

    // Reposiciona cursor (auto-avanço após / inserida)
    let newPos = cursorPos;
    if (cursorPos === 2 || cursorPos === 5) newPos = cursorPos + 1;
    this.input.setSelectionRange(newPos, newPos);

    // Sincroniza calendário se data completa
    if (raw.length === 8) {
      const date = this._parseRaw8(raw);
      if (date) {
        this.state.selectedDate = date;
        this.state.viewDate = new Date(date);
        if (this.state.isVisible) this._render();
      }
    }
  }

  _handleInputBlur() {
    this._commitFromDisplay();
    // Fecha com pequeno delay para permitir clicks no calendário
    setTimeout(() => this.close(), 180);
  }

  _commitFromDisplay() {
    const val = this.input.value.trim();
    if (!val) return;

    const date = this._parseDisplayDate(val);
    if (date) {
      const iso = this.options.format(date);
      this.state.selectedDate = date;
      this._updateInput(iso); // grava YYYY-MM-DD no value
      if (this.options.onChange) this.options.onChange(date);
    } else {
      // Data inválida — restaura valor anterior ou limpa
      if (this.state.selectedDate) {
        this._updateInput(this.options.format(this.state.selectedDate));
      } else {
        this._updateInput('');
      }
    }
  }

  // ─── Parsers ───────────────────────────────────────────────────────────────

  _parseRaw8(raw) {
    // raw = 8 dígitos: DDMMAAAA
    const d = +raw.slice(0, 2);
    const m = +raw.slice(2, 4);
    const y = +raw.slice(4, 8);
    return this._buildDate(d, m, y);
  }

  _parseDisplayDate(val) {
    // DD/MM/AAAA
    const dmy = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return this._buildDate(+dmy[1], +dmy[2], +dmy[3]);

    // YYYY-MM-DD (colado ou preenchido pelo calendário)
    const ymd = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) return this._buildDate(+ymd[3], +ymd[2], +ymd[1]);

    return null;
  }

  _buildDate(d, m, y) {
    if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const date = new Date(y, m - 1, d);
    date.setHours(0, 0, 0, 0);
    if (date.getDate() !== d || date.getMonth() !== m - 1) return null; // dia inválido (ex: 31/02)
    return date;
  }

  // ─── Helpers de input ──────────────────────────────────────────────────────

  _setRawDisplay(val) {
    // Seta o value sem disparar nosso handler de máscara
    this._suppressInput = true;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(this.input, val);
    this._suppressInput = false;
  }

  _updateInput(value) {
    this._suppressInput = true;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(this.input, value);
    this.input.dispatchEvent(new Event('input',  { bubbles: true }));
    this.input.dispatchEvent(new Event('change', { bubbles: true }));
    this._suppressInput = false;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  _render() {
    const body  = this.root.querySelector('.dp-body');
    const title = this.root.querySelector('.dp-title');
    body.replaceChildren();
    if (this.state.view === 'day')        this._renderDays(body, title);
    else if (this.state.view === 'month') this._renderMonths(body, title);
    else                                  this._renderYears(body, title);
  }

  _renderDays(container, titleEl) {
    container.className = 'dp-body dp-grid';
    const year  = this.state.viewDate.getFullYear();
    const month = this.state.viewDate.getMonth();
    titleEl.textContent = this.state.viewDate.toLocaleString(this.options.locale, { month: 'long', year: 'numeric' });

    const frag = document.createDocumentFragment();
    ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].forEach(d => {
      const el = document.createElement('div');
      el.className = 'dp-cell dp-label'; el.textContent = d; frag.appendChild(el);
    });

    const firstDay    = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDay; i++) {
      const el = document.createElement('div');
      el.className = 'dp-cell dp-other-month'; frag.appendChild(el);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const ts   = date.getTime();
      const el   = document.createElement('div');
      el.className = 'dp-cell'; el.dataset.ts = ts; el.textContent = i;

      if ((this.options.minDate && ts < this.options.minDate.getTime()) ||
          (this.options.maxDate && ts > this.options.maxDate.getTime())) {
        el.classList.add('dp-disabled');
      } else {
        const activeDate = this.options.showActions ? this.state.pendingDate : this.state.selectedDate;
        if (this.options.mode === 'single' && activeDate && ts === activeDate.getTime()) {
          el.classList.add('dp-selected'); el.style.background = this.options.primaryColor;
        }
        if (this.options.mode === 'range' && this.state.rangeStart) {
          const startTs = this.state.rangeStart.getTime();
          if (ts === startTs) { el.classList.add('dp-range-start'); el.style.background = this.options.primaryColor; }
          if (this.state.rangeEnd) {
            const endTs = this.state.rangeEnd.getTime();
            if (ts === endTs) { el.classList.add('dp-range-end'); el.style.background = this.options.primaryColor; }
            if (ts > startTs && ts < endTs) { el.classList.add('dp-in-range'); el.style.background = `${this.options.primaryColor}20`; }
          }
        }
      }

      if (ts === today.getTime()) el.classList.add('dp-today');
      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  _renderMonths(container, titleEl) {
    container.className = 'dp-body dp-grid-wide';
    titleEl.textContent = this.state.viewDate.getFullYear();
    const currentMonth = new Date().getMonth();
    const currentYear  = new Date().getFullYear();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 12; i++) {
      const date = new Date(this.state.viewDate.getFullYear(), i, 1);
      const el   = document.createElement('div');
      el.className = 'dp-cell';
      if (i === currentMonth && currentYear === this.state.viewDate.getFullYear()) el.classList.add('dp-today');
      el.dataset.ts = date.getTime();
      el.textContent = date.toLocaleString(this.options.locale, { month: 'short' });
      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  _renderYears(container, titleEl) {
    container.className = 'dp-body dp-grid-wide';
    const startYear  = Math.floor(this.state.viewDate.getFullYear() / 10) * 10;
    titleEl.textContent = `${startYear} – ${startYear + 9}`;
    const currentYear = new Date().getFullYear();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 12; i++) {
      const year = startYear - 1 + i;
      const date = new Date(year, 0, 1);
      const el   = document.createElement('div');
      el.className = 'dp-cell';
      if (year === currentYear) el.classList.add('dp-today');
      if (i === 0 || i === 11) el.classList.add('dp-other-month');
      el.dataset.ts = date.getTime(); el.textContent = year;
      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  // ─── Seleção / navegação ───────────────────────────────────────────────────

  _handleSelection(target) {
    const timestamp = parseInt(target.dataset.ts);
    if (isNaN(timestamp)) return;
    const rawDate = new Date(timestamp);

    if (this.state.view !== 'day') {
      if (this.state.view === 'year') { this.state.viewDate.setFullYear(rawDate.getFullYear()); this.state.view = 'month'; }
      else                            { this.state.viewDate.setMonth(rawDate.getMonth());        this.state.view = 'day';   }
      this._render(); return;
    }

    if (this.options.mode === 'single') {
      if (this.options.showActions) {
        this.state.pendingDate = rawDate;
      } else {
        this.state.selectedDate = rawDate;
        this._updateInput(this.options.format(rawDate));
        if (this.options.onChange) this.options.onChange(rawDate);
        this.close();
      }
    } else {
      if (!this.state.rangeStart || (this.state.rangeStart && this.state.rangeEnd)) {
        this.state.rangeStart = rawDate; this.state.rangeEnd = null;
        if (!this.options.showActions) this._updateInput(`${this.options.format(rawDate)} - ...`);
      } else if (rawDate < this.state.rangeStart) {
        this.state.rangeStart = rawDate;
        if (!this.options.showActions) this._updateInput(`${this.options.format(rawDate)} - ...`);
      } else {
        this.state.rangeEnd = rawDate;
        if (!this.options.showActions) {
          this._updateInput(`${this.options.format(this.state.rangeStart)} - ${this.options.format(rawDate)}`);
          if (this.options.onChange) this.options.onChange({ start: this.state.rangeStart, end: rawDate });
          this.close();
        }
      }
    }
    this._render();
  }

  _handleNavigation(action) {
    const { view, viewDate } = this.state;
    if (action === 'confirm') {
      if (this.options.mode === 'single' && this.state.pendingDate) {
        this.state.selectedDate = this.state.pendingDate; this.state.pendingDate = null;
        this._updateInput(this.options.format(this.state.selectedDate));
        if (this.options.onChange) this.options.onChange(this.state.selectedDate);
      } else if (this.options.mode === 'range' && this.state.rangeStart && this.state.rangeEnd) {
        this._updateInput(`${this.options.format(this.state.rangeStart)} - ${this.options.format(this.state.rangeEnd)}`);
        if (this.options.onChange) this.options.onChange({ start: this.state.rangeStart, end: this.state.rangeEnd });
      }
      this.close();
    } else if (action === 'cancel') {
      this.state.pendingDate = null; this.close();
    } else if (action === 'switch-view') {
      this.state.view = view === 'day' ? 'month' : 'year'; this._render();
    } else {
      const dir = action === 'next' ? 1 : -1;
      if (view === 'day')   viewDate.setMonth(viewDate.getMonth() + dir);
      if (view === 'month') viewDate.setFullYear(viewDate.getFullYear() + dir);
      if (view === 'year')  viewDate.setFullYear(viewDate.getFullYear() + dir * 10);
      this._render();
    }
  }

  // ─── Posicionamento / abertura ─────────────────────────────────────────────

  _position() {
    if (!this.state.isVisible) return;
    const rect = this.input.getBoundingClientRect();
    let top  = rect.bottom + window.scrollY + 4;
    let left = rect.left   + window.scrollX;
    const pw = 280 + 32;
    if (left + pw > window.innerWidth) left = Math.max(8, window.innerWidth - pw);
    if (top + 340 > window.innerHeight + window.scrollY) top = rect.top + window.scrollY - 344;
    this.root.style.top  = `${top}px`;
    this.root.style.left = `${left}px`;
  }

  open() {
    this.state.isVisible = true; this.state.pendingDate = null;
    this.root.classList.add('dp-visible');
    this._position(); this._render();
  }

  close() {
    if (!this.state.isVisible) return;
    this.state.isVisible = false;
    this.root.classList.remove('dp-visible');
  }

  _normalizeDate(d) { const date = new Date(d); date.setHours(0, 0, 0, 0); return date; }

  _handleDocumentClick(e) {
    if (this.state.isVisible && !this.root.contains(e.target) && e.target !== this.input) {
      this.close();
    }
  }

  _handleResize() { if (this.state.isVisible) this._position(); }
}

// ─── Override de tema HLV (CSS variables) ────────────────────────────────────
let _themeOverrideInjected = false;

function _injectThemeOverride() {
  if (_themeOverrideInjected) return;
  _themeOverrideInjected = true;
  const style = document.createElement('style');
  style.id = 'esseal-dp-hlv-theme';
  style.textContent = `
    .dp-container {
      background: var(--bg-input-solid) !important;
      border: 1px solid var(--border-strong) !important;
      color: var(--text-primary) !important;
      box-shadow: 0 16px 40px rgba(0,0,0,.55), 0 0 0 1px var(--border-default) !important;
      border-radius: 10px !important;
    }
    .dp-nav-btn { color: var(--text-secondary) !important; border-radius: 6px !important; }
    .dp-nav-btn:hover { background: var(--border-subtle) !important; color: var(--text-primary) !important; }
    .dp-title { color: var(--text-primary) !important; font-size: 13px !important; border-radius: 6px !important; }
    .dp-title:hover { background: var(--border-subtle) !important; }
    .dp-label { color: var(--text-tertiary) !important; font-size: 10.5px !important; font-weight: 600 !important; letter-spacing: .05em; }
    .dp-cell { font-size: 12.5px !important; border-radius: 6px !important; }
    .dp-cell:not(.dp-label):not(.dp-disabled):hover { background: var(--border-subtle) !important; }
    .dp-other-month { color: var(--text-tertiary) !important; opacity: .4; }
    .dp-disabled { color: var(--text-tertiary) !important; }
    .dp-footer { border-top-color: var(--border-default) !important; }
    .dp-btn-cancel {
      background: var(--bg-input-solid) !important;
      color: var(--text-secondary) !important;
      border-color: var(--border-strong) !important;
    }
    .dp-btn-cancel:hover { background: var(--border-subtle) !important; }
    .dp-input { cursor: text !important; }
    .dp-input:focus { outline: 2px solid var(--accent) !important; outline-offset: 2px; }
  `;
  document.head.appendChild(style);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _accentHex() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#63ffab';
}
function _textPrimary() {
  return getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#ffffff';
}
function _registry() {
  if (!window.__hlvDatePickers) window.__hlvDatePickers = [];
  return window.__hlvDatePickers;
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Cria um date picker integrado ao tema HLV atual.
 * @param {HTMLInputElement} el
 * @param {Object} [opts]  – minDate, maxDate, onChange, etc.
 * @returns {EssealDatePicker|null}
 */
export function initDatePicker(el, opts = {}) {
  if (!el) return null;
  _injectThemeOverride();

  const picker = new EssealDatePicker(el, {
    locale: 'pt-BR',
    format: date => date.toLocaleDateString('en-CA'), // YYYY-MM-DD para Supabase
    primaryColor: _accentHex(),
    textColor: _textPrimary(),
    zIndex: 10500,
    ...opts,
  });

  // Pré-carrega data já preenchida no input (YYYY-MM-DD → estado interno)
  if (el.value) {
    const d = new Date(el.value + 'T00:00:00');
    if (!isNaN(d.getTime())) {
      picker.state.viewDate     = new Date(d);
      picker.state.selectedDate = d;
    }
  }

  _registry().push(picker);
  return picker;
}

/**
 * Destrói todos os pickers registrados.
 * Chamado automaticamente pelo closeModal() em components.js.
 */
export function destroyAllPickers() {
  _registry().forEach(p => { try { p.destroy(); } catch {} });
  window.__hlvDatePickers = [];
}
