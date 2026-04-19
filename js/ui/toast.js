/**
 * toast.js — Toast-Anchor embedded (all src inline, no external imports).
 * Configured globally: position top-right, sound enabled.
 * Card styling reads CSS variables at call time → adapts to all 4 themes.
 * Backward-compatible: toast(msg, type) still works.
 */

// ── CSS variable reader ───────────────────────────────────────────────────────
function _css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Called at the start of createToast to sync DEFAULTS.toast with current theme
function _syncTheme() {
  const bg     = _css('--bg-input-solid') || '#1e1e1e';
  const color  = _css('--text-primary')   || '#ffffff';
  const desc   = _css('--text-secondary') || 'rgba(255,255,255,0.5)';
  const border = _css('--border-default') || 'rgba(255,255,255,0.1)';
  const radius = _css('--radius-md')      || '12px';
  const shadow = _css('--shadow-md') || '0 4px 24px rgba(0,0,0,0.25)';
  Object.assign(DEFAULTS.toast, {
    bg,
    color,
    descColor:   desc,
    borderColor: border,
    borderRadius: radius,
    shadow: shadow || '0 4px 24px rgba(0,0,0,0.25)',
    closeColor:      desc,
    closeHoverColor: color,
  });
}

// ── audio ─────────────────────────────────────────────────────────────────────
let _audioCtx = null;
const _AUDIO_PROFILES = {
  success: { wave: 'sine',     sf: 600, ef: 900, gs: 0.15, ge: 0.01, dur: 0.15 },
  error:   { wave: 'sawtooth', sf: 400, ef: 200, gs: 0.15, ge: 0.01, dur: 0.15 },
  warning: { wave: 'triangle', sf: 600, ef: 380, gs: 0.12, ge: 0.01, dur: 0.13 },
  info:    { wave: 'sine',     sf: 800, ef: 300, gs: 0.15, ge: 0.01, dur: 0.10 },
  pop:     { wave: 'sine',     sf: 700, ef: 350, gs: 0.12, ge: 0.01, dur: 0.10 },
};
function playSound(type = 'success') {
  if (typeof window === 'undefined') return;
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
    const p = _AUDIO_PROFILES[type] || _AUDIO_PROFILES.pop;
    const osc = _audioCtx.createOscillator();
    const gain = _audioCtx.createGain();
    const t = _audioCtx.currentTime;
    osc.type = p.wave;
    osc.frequency.setValueAtTime(p.sf, t);
    osc.frequency.exponentialRampToValueAtTime(p.ef, t + p.dur);
    gain.gain.setValueAtTime(p.gs, t);
    gain.gain.exponentialRampToValueAtTime(p.ge, t + p.dur);
    osc.connect(gain);
    gain.connect(_audioCtx.destination);
    osc.start();
    osc.stop(t + p.dur);
  } catch (_) {}
}

// ── icons ─────────────────────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('__tk_css')) {
  const s = document.createElement('style');
  s.id = '__tk_css';
  s.textContent = '@keyframes __tk_spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);
}
const ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`,
  error:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`,
  info:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  loading: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:__tk_spin 1s linear infinite"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
};

// ── defaults ──────────────────────────────────────────────────────────────────
// toast.bg/color/etc will be overridden by _syncTheme() at call time
const DEFAULTS = {
  position:       'top-right',
  duration:       4000,
  sound:          true,
  dismissOnClick: false,
  showProgress:   true,
  maxToasts:      5,
  theme: {
    success: { bg: '#10b981', light: 'rgba(16,185,129,0.18)' },
    error:   { bg: '#ef4444', light: 'rgba(239,68,68,0.18)'  },
    warning: { bg: '#f59e0b', light: 'rgba(245,158,11,0.18)' },
    info:    { bg: '#3b82f6', light: 'rgba(59,130,246,0.18)' },
  },
  toast: {
    bg:            '#1e1e1e',
    color:         '#ffffff',
    descColor:     'rgba(255,255,255,0.55)',
    borderColor:   'rgba(255,255,255,0.1)',
    borderWidth:   '1px',
    borderRadius:  '12px',
    shadow:        '0 4px 24px rgba(0,0,0,0.25)',
    padding:       '13px 14px',
    width:         '320px',
    fontSize:      '13.5px',
    fontWeight:    '600',
    descFontSize:  '12px',
    descFontWeight:'400',
    showIcon:      true,
    showClose:     true,
    closeColor:    'rgba(255,255,255,0.4)',
    closeHoverColor:'rgba(255,255,255,0.85)',
    progressH:     '3px',
    progressRadius:'0 0 12px 12px',
    iconSize:      '32px',
    iconRadius:    '50%',
    actionColor:   null,
    actionFontSize:'12px',
  },
  anchored: {
    position:     'top',
    bg:           '#0f172a',
    color:        '#ffffff',
    borderColor:  'transparent',
    borderWidth:  '0px',
    borderRadius: '10px',
    shadow:       '0 8px 24px rgba(0,0,0,0.2)',
    padding:      '8px 14px',
    fontSize:     '13px',
    fontWeight:   '600',
    showIcon:     true,
    arrowSize:    10,
    showArrow:    true,
    gap:          13,
  },
  anchoredConfirm: {
    position:       'top',
    bg:             '#0f172a',
    color:          '#f8fafc',
    borderColor:    'transparent',
    borderWidth:    '0px',
    borderRadius:   '12px',
    shadow:         '0 8px 28px rgba(0,0,0,0.22)',
    padding:        '12px 14px',
    fontSize:       '13px',
    minWidth:       '160px',
    showIcon:       true,
    confirmBg:      '#ef4444',
    confirmColor:   '#ffffff',
    confirmHoverBg: '#dc2626',
    cancelBg:       '#1e293b',
    cancelColor:    '#94a3b8',
    cancelHoverBg:  '#334155',
    cancelBorder:   '#334155',
    btnRadius:      '8px',
    btnFontSize:    '12px',
    btnFontWeight:  '700',
    btnPadding:     '6px 0',
    arrowSize:      10,
    showArrow:      true,
    gap:            13,
  },
  modal: {
    position:        'center',
    overlayBg:       'rgba(0,0,0,0.6)',
    overlayBlur:     '6px',
    bg:              '#1e1e1e',
    borderColor:     'rgba(255,255,255,0.08)',
    borderWidth:     '1px',
    borderRadius:    '16px',
    shadow:          '0 25px 60px rgba(0,0,0,0.5)',
    maxWidth:        '420px',
    padding:         '24px',
    footerBg:        'rgba(255,255,255,0.04)',
    footerBorder:    'rgba(255,255,255,0.08)',
    footerPaddingV:  '14px',
    footerPaddingVB: '18px',
    titleColor:      '#ffffff',
    titleSize:       '17px',
    titleWeight:     '700',
    titleMargin:     '0 0 8px',
    messageColor:    'rgba(255,255,255,0.55)',
    messageSize:     '14px',
    iconSize:        '48px',
    iconRadius:      '50%',
    iconBg:          null,
    iconColor:       null,
    confirmBg:       null,
    confirmColor:    '#ffffff',
    confirmHoverBg:  null,
    confirmRadius:   '10px',
    confirmSize:     '13.5px',
    confirmWeight:   '600',
    confirmPadding:  '9px 22px',
    cancelColor:     'rgba(255,255,255,0.55)',
    cancelHoverBg:   'rgba(255,255,255,0.06)',
    cancelRadius:    '10px',
    cancelSize:      '13.5px',
    cancelWeight:    '500',
    cancelPadding:   '9px 18px',
    cancelBg:        'transparent',
    cancelBorder:    'none',
  },
};

function configure(options = {}) {
  const SUB_KEYS = ['toast', 'anchored', 'anchoredConfirm', 'modal', 'theme'];
  for (const [k, v] of Object.entries(options)) {
    if (SUB_KEYS.includes(k) && v && typeof v === 'object') {
      if (k === 'theme') {
        for (const [tk, tv] of Object.entries(v)) {
          DEFAULTS.theme[tk] = { ...DEFAULTS.theme[tk], ...tv };
        }
      } else {
        Object.assign(DEFAULTS[k], v);
      }
    } else {
      DEFAULTS[k] = v;
    }
  }
}

// ── core-toast ────────────────────────────────────────────────────────────────
const POSITION_CSS = {
  'top-left':      'top:1.5rem;left:1.5rem;flex-direction:column',
  'top-center':    'top:1.5rem;left:50%;transform:translateX(-50%);flex-direction:column',
  'top-right':     'top:1.5rem;right:1.5rem;flex-direction:column',
  'middle-left':   'top:50%;left:1.5rem;transform:translateY(-50%);flex-direction:column',
  'middle-center': 'top:50%;left:50%;transform:translate(-50%,-50%);flex-direction:column',
  'middle-right':  'top:50%;right:1.5rem;transform:translateY(-50%);flex-direction:column',
  'bottom-left':   'bottom:1.5rem;left:1.5rem;flex-direction:column-reverse',
  'bottom-center': 'bottom:1.5rem;left:50%;transform:translateX(-50%);flex-direction:column-reverse',
  'bottom-right':  'bottom:1.5rem;right:1.5rem;flex-direction:column-reverse',
};

const _containers = new Map();
const _active = new Map();
let _seq = 0;

function _getContainer(pos) {
  if (typeof document === 'undefined') return null;
  if (_containers.has(pos)) return _containers.get(pos);
  const el = document.createElement('div');
  el.id = `__tk_c_${pos.replace(/-/g, '_')}`;
  el.setAttribute('style',
    `position:fixed;z-index:9999;display:flex;gap:10px;pointer-events:none;` +
    (POSITION_CSS[pos] || POSITION_CSS['top-right'])
  );
  document.body.appendChild(el);
  _containers.set(pos, el);
  return el;
}

function dismissToast(id) {
  const entry = _active.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  const el = entry.el;
  el.style.opacity   = '0';
  el.style.transform = 'scale(0.9) translateY(-6px)';
  el.style.maxHeight = el.offsetHeight + 'px';
  setTimeout(() => {
    el.style.transition = 'all 0.32s ease-out';
    el.style.maxHeight  = '0';
    el.style.padding    = '0';
    el.style.margin     = '0';
    el.style.overflow   = 'hidden';
  }, 60);
  setTimeout(() => { el.remove(); _active.delete(id); }, 420);
}

function dismissAll() {
  [..._active.keys()].forEach(dismissToast);
}

function nextId() { return `__tk_${++_seq}`; }

function createToast(message, options = {}) {
  if (typeof document === 'undefined') return () => {};

  // Sync card style with current app theme
  _syncTheme();

  const D  = DEFAULTS;
  const TS = D.toast;

  const o = {
    type:           'success',
    position:       D.position,
    duration:       D.duration,
    sound:          D.sound,
    dismissOnClick: D.dismissOnClick,
    showProgress:   D.showProgress,
    description:    null,
    icon:           null,
    action:         null,
    id:             null,
    showIcon:       undefined,
    showClose:      undefined,
    ...options,
  };

  const type  = o.type;
  const theme = D.theme[type] || D.theme.success;
  const r     = (k) => o[k] !== undefined ? o[k] : TS[k];

  const bg             = r('bg');
  const color          = r('color');
  const descColor      = r('descColor');
  const borderColor    = r('borderColor');
  const borderWidth    = r('borderWidth');
  const borderRadius   = r('borderRadius');
  const shadow         = r('shadow');
  const padding        = r('padding');
  const width          = r('width');
  const fontSize       = r('fontSize');
  const fontWeight     = r('fontWeight');
  const descFontSize   = r('descFontSize');
  const descFontWeight = r('descFontWeight');
  const closeColor     = r('closeColor');
  const closeHoverC    = r('closeHoverColor');
  const progressH      = r('progressH');
  const progressRadius = r('progressRadius');
  const progressColor  = o.progressColor  || theme.bg;
  const iconBg         = o.iconBg         || theme.light;
  const iconColor      = o.iconColor      || theme.bg;
  const iconSize       = r('iconSize');
  const iconRadius     = r('iconRadius');
  const actionColor    = o.actionColor    || theme.bg;
  const actionFontSize = r('actionFontSize');

  const icon = o.icon || ICONS[type] || ICONS.success;
  const id   = o.id   || nextId();
  const showIcon  = o.showIcon  !== undefined ? o.showIcon  : TS.showIcon  !== undefined ? TS.showIcon  : true;
  const showClose = o.showClose !== undefined ? o.showClose : TS.showClose !== undefined ? TS.showClose : true;

  const hasExtra = !!(o.description || o.action);
  const rowAlign = hasExtra ? 'align-items:flex-start' : 'align-items:center';
  const bodyPad  = hasExtra ? 'padding-top:2px' : '';

  if (o.sound) playSound(type);

  const container = _getContainer(o.position);
  if (!container) return () => {};

  if (_active.size >= D.maxToasts) dismissToast(_active.keys().next().value);

  const el = document.createElement('div');
  el.id = id;
  // Left accent stripe using type color
  el.setAttribute('style', [
    'pointer-events:auto',
    'position:relative',
    'overflow:hidden',
    'display:flex',
    rowAlign,
    'gap:12px',
    `width:${width}`,
    `background:${bg}`,
    `border:${borderWidth} solid ${borderColor}`,
    `border-left:3px solid ${theme.bg}`,
    `padding:${padding}`,
    `border-radius:${borderRadius}`,
    `box-shadow:${shadow}`,
    'transition:all 0.38s cubic-bezier(0.34,1.56,0.64,1)',
    'opacity:0',
    'transform:scale(0.92) translateY(-10px)',
    `cursor:${o.dismissOnClick ? 'pointer' : 'default'}`,
    'box-sizing:border-box',
    'font-family:var(--font-sans,system-ui,sans-serif)',
  ].join(';'));

  el.innerHTML = `
    ${showIcon ? `<div style="display:flex;align-items:center;justify-content:center;width:${iconSize};height:${iconSize};min-width:${iconSize};border-radius:${iconRadius};background:${iconBg};color:${iconColor};flex-shrink:0">
      <div style="width:16px;height:16px;display:flex">${icon}</div>
    </div>` : ''}
    <div style="flex:1;min-width:0;${bodyPad}">
      <p style="font-size:${fontSize};font-weight:${fontWeight};color:${color};line-height:1.4;margin:0">${message}</p>
      ${o.description ? `<p style="font-size:${descFontSize};font-weight:${descFontWeight};color:${descColor};margin:3px 0 0;line-height:1.5">${o.description}</p>` : ''}
      ${o.action      ? `<button data-tk-action style="margin-top:7px;font-size:${actionFontSize};font-weight:700;color:${actionColor};background:none;border:none;cursor:pointer;padding:0;display:block;line-height:1">${o.action.label}</button>` : ''}
    </div>
    ${showClose ? `<button data-tk-close
      style="flex-shrink:0;background:none;border:none;cursor:pointer;color:${closeColor};padding:2px;line-height:0;border-radius:4px;transition:color 0.15s"
      title="Fechar"
      onmouseenter="this.style.color='${closeHoverC}'"
      onmouseleave="this.style.color='${closeColor}'"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </button>` : ''}
    ${o.showProgress && o.duration > 0
      ? `<div data-tk-bar style="position:absolute;bottom:0;left:0;height:${progressH};border-radius:${progressRadius};background:${progressColor};width:100%;transition:width ${o.duration}ms linear"></div>`
      : ''}
  `.trim();

  container.appendChild(el);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.opacity   = '1';
    el.style.transform = 'scale(1) translateY(0)';
    if (o.showProgress && o.duration > 0) {
      const bar = el.querySelector('[data-tk-bar]');
      if (bar) bar.style.width = '0%';
    }
  }));

  const dismiss = () => dismissToast(id);
  let timer = null;
  if (o.duration > 0) timer = setTimeout(dismiss, o.duration);

  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => {
    if (o.duration > 0) timer = setTimeout(dismiss, Math.min(o.duration, 1500));
  });

  el.querySelector('[data-tk-close]')?.addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });
  if (o.dismissOnClick) el.addEventListener('click', dismiss);
  el.querySelector('[data-tk-action]')?.addEventListener('click', (e) => {
    e.stopPropagation(); o.action?.onClick?.(); dismiss();
  });

  _active.set(id, { el, timer });
  return dismiss;
}

// ── promise-toast ─────────────────────────────────────────────────────────────
let _promiseSeq = 0;
function promiseToast(promise, messages = {}, options = {}) {
  const { loading = 'Carregando…', success = 'Concluído!', error = 'Algo deu errado' } = messages;
  const id = `__tk_p${++_promiseSeq}`;
  createToast(loading, { type: 'info', duration: 0, icon: ICONS.loading, sound: false, id, ...options });
  Promise.resolve(promise)
    .then((result) => {
      dismissToast(id);
      createToast(typeof success === 'function' ? success(result) : success, { type: 'success', ...options });
    })
    .catch((err) => {
      dismissToast(id);
      createToast(typeof error === 'function' ? error(err) : error, { type: 'error', ...options });
    });
  return () => dismissToast(id);
}

// ── anchored helpers ──────────────────────────────────────────────────────────
function placeElement(el, anchor, side, gap) {
  const ar = anchor.getBoundingClientRect();
  const er = el.getBoundingClientRect();
  const sx = window.scrollX, sy = window.scrollY;
  let top, left;
  switch (side) {
    case 'bottom': top = ar.bottom + sy + gap; left = ar.left + sx + ar.width / 2 - er.width / 2; break;
    case 'left':   top = ar.top + sy + ar.height / 2 - er.height / 2; left = ar.left + sx - er.width - gap; break;
    case 'right':  top = ar.top + sy + ar.height / 2 - er.height / 2; left = ar.right + sx + gap; break;
    default:       top = ar.top + sy - er.height - gap; left = ar.left + sx + ar.width / 2 - er.width / 2;
  }
  el.style.top  = `${top}px`;
  el.style.left = `${left}px`;
}

function arrowStyle(side, size, bg, borderColor, borderWidth) {
  const half = size / 2;
  const bw = borderWidth && borderWidth !== '0px' ? borderWidth : '0px';
  const bc = borderColor || 'transparent';
  const hasBorder = bw !== '0px';
  let borderCSS = '';
  if (hasBorder) {
    const solid = `${bw} solid ${bc}`, none = `${bw} solid transparent`;
    switch (side) {
      case 'top':    borderCSS = `border-top:${none};border-right:${solid};border-bottom:${solid};border-left:${none};`; break;
      case 'bottom': borderCSS = `border-top:${solid};border-right:${none};border-bottom:${none};border-left:${solid};`; break;
      case 'left':   borderCSS = `border-top:${solid};border-right:${solid};border-bottom:${none};border-left:${none};`; break;
      case 'right':  borderCSS = `border-top:${none};border-right:${none};border-bottom:${solid};border-left:${solid};`; break;
    }
  }
  const base = `${borderCSS}position:absolute;width:${size}px;height:${size}px;background:${bg};transform:rotate(45deg);`;
  switch (side) {
    case 'bottom': return `${base}top:${-half}px;left:50%;margin-left:${-half}px`;
    case 'left':   return `${base}top:50%;right:${-half}px;margin-top:${-half}px`;
    case 'right':  return `${base}top:50%;left:${-half}px;margin-top:${-half}px`;
    default:       return `${base}bottom:${-half}px;left:50%;margin-left:${-half}px`;
  }
}

function entryTransform(side) {
  switch (side) {
    case 'bottom': return 'scale(0.88) translateY(-8px)';
    case 'left':   return 'scale(0.88) translateX(8px)';
    case 'right':  return 'scale(0.88) translateX(-8px)';
    default:       return 'scale(0.88) translateY(8px)';
  }
}

function exitTransform(side) {
  switch (side) {
    case 'bottom': return 'scale(0.9) translateY(-4px)';
    case 'left':   return 'scale(0.9) translateX(4px)';
    case 'right':  return 'scale(0.9) translateX(-4px)';
    default:       return 'scale(0.9) translateY(4px)';
  }
}

// ── anchored-toast ────────────────────────────────────────────────────────────
const _anchoredMap = new WeakMap();
function anchoredToast(message, anchor, options = {}) {
  if (typeof document === 'undefined' || !anchor) return () => {};
  const o = { type: 'success', duration: 2500, sound: DEFAULTS.sound, icon: null, ...DEFAULTS.anchored, ...options };
  const theme = DEFAULTS.theme[o.type] || DEFAULTS.theme.success;
  const icon  = o.icon || ICONS[o.type];
  const side  = o.position;
  if (o.sound) playSound(o.type);
  const prevDismiss = _anchoredMap.get(anchor);
  if (prevDismiss) prevDismiss();
  const showIcon = o.showIcon !== undefined ? o.showIcon : true;
  const el = document.createElement('div');
  el.setAttribute('style', [
    'position:absolute', 'z-index:9998',
    `padding:${o.padding}`, `background:${o.bg}`, `color:${o.color}`,
    `font-size:${o.fontSize}`, `font-weight:${o.fontWeight}`,
    `border-radius:${o.borderRadius}`, `border:${o.borderWidth} solid ${o.borderColor}`,
    `box-shadow:${o.shadow}`, 'pointer-events:none', 'white-space:nowrap',
    'transition:opacity 0.3s ease,transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
    'opacity:0', `transform:${entryTransform(side)}`,
  ].join(';'));
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:7px">
      ${showIcon ? `<div style="width:15px;height:15px;display:flex;flex-shrink:0;color:${theme.bg}">${icon}</div>` : ''}
      <span>${message}</span>
    </div>
    ${o.showArrow ? `<div style="${arrowStyle(side, o.arrowSize, o.bg, o.borderColor, o.borderWidth)}"></div>` : ''}
  `.trim();
  document.body.appendChild(el);
  placeElement(el, anchor, side, o.gap);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.opacity = '1'; el.style.transform = 'scale(1) translate(0,0)';
  }));
  const dismiss = () => {
    _anchoredMap.delete(anchor);
    el.style.opacity = '0'; el.style.transform = exitTransform(side);
    setTimeout(() => el.remove(), 300);
  };
  _anchoredMap.set(anchor, dismiss);
  if (o.duration > 0) setTimeout(dismiss, o.duration);
  return dismiss;
}

// ── anchored-confirm ──────────────────────────────────────────────────────────
const _confirmMap = new WeakMap();
function anchoredConfirm(message, anchor, onConfirm, onCancel, options = {}) {
  if (typeof document === 'undefined' || !anchor) return;
  const o = { confirmLabel: 'Sim', cancelLabel: 'Não', sound: DEFAULTS.sound, ...DEFAULTS.anchoredConfirm, ...options };
  const side = o.position;
  if (o.sound) playSound('warning');
  const prevDismiss = _confirmMap.get(anchor);
  if (prevDismiss) prevDismiss();
  const showIcon = o.showIcon !== undefined ? o.showIcon : true;
  const el = document.createElement('div');
  el.setAttribute('style', [
    'position:absolute', 'z-index:9998',
    `padding:${o.padding}`, `background:${o.bg}`, `color:${o.color}`,
    `font-size:${o.fontSize}`, `border-radius:${o.borderRadius}`,
    `border:${o.borderWidth} solid ${o.borderColor}`,
    `box-shadow:${o.shadow}`, `min-width:${o.minWidth}`,
    'pointer-events:auto',
    'transition:opacity 0.3s ease,transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
    'opacity:0', `transform:${entryTransform(side)}`,
  ].join(';'));
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      ${showIcon ? `<div style="width:15px;height:15px;flex-shrink:0;color:#fca5a5">${ICONS.warning}</div>` : ''}
      <span>${message}</span>
    </div>
    <div style="display:flex;gap:7px">
      <button data-cancel style="flex:1;padding:${o.btnPadding};background:${o.cancelBg};border:1px solid ${o.cancelBorder};color:${o.cancelColor};border-radius:${o.btnRadius};cursor:pointer;font-weight:${o.btnFontWeight};font-size:${o.btnFontSize};transition:background 0.15s,color 0.15s">${o.cancelLabel}</button>
      <button data-confirm style="flex:1;padding:${o.btnPadding};background:${o.confirmBg};border:none;color:${o.confirmColor};border-radius:${o.btnRadius};cursor:pointer;font-weight:${o.btnFontWeight};font-size:${o.btnFontSize};transition:background 0.15s">${o.confirmLabel}</button>
    </div>
    ${o.showArrow ? `<div style="${arrowStyle(side, o.arrowSize, o.bg, o.borderColor, o.borderWidth)}"></div>` : ''}
  `.trim();
  document.body.appendChild(el);
  placeElement(el, anchor, side, o.gap);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.opacity = '1'; el.style.transform = 'scale(1) translate(0,0)';
  }));
  const dismiss = () => {
    _confirmMap.delete(anchor);
    el.style.opacity = '0'; el.style.transform = exitTransform(side);
    setTimeout(() => el.remove(), 280);
  };
  _confirmMap.set(anchor, dismiss);
  const confirmBtn = el.querySelector('[data-confirm]');
  const cancelBtn  = el.querySelector('[data-cancel]');
  confirmBtn.addEventListener('mouseenter', () => { confirmBtn.style.background = o.confirmHoverBg; });
  confirmBtn.addEventListener('mouseleave', () => { confirmBtn.style.background = o.confirmBg; });
  cancelBtn.addEventListener('mouseenter',  () => { cancelBtn.style.background  = o.cancelHoverBg; });
  cancelBtn.addEventListener('mouseleave',  () => { cancelBtn.style.background  = o.cancelBg; });
  confirmBtn.onclick = () => { dismiss(); onConfirm?.(); };
  cancelBtn.onclick  = () => { dismiss(); onCancel?.(); };
}

// ── modal-confirm ─────────────────────────────────────────────────────────────
function modalConfirm(title, message, options = {}) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(false);
    _syncTheme();
    const MD = DEFAULTS.modal;
    const o  = { ...MD, confirmLabel: 'Confirmar', cancelLabel: 'Cancelar', confirmVariant: 'danger', icon: null, sound: DEFAULTS.sound, ...options };
    const isTop      = o.position === 'top';
    const alignItems = isTop ? 'flex-start' : 'center';
    const overlayPad = isTop ? 'padding:5vh 16px 16px' : 'padding:16px';
    if (o.sound) playSound('warning');
    const isDanger = o.confirmVariant !== 'primary';
    const confBg   = o.confirmBg      || (isDanger ? '#ef4444' : '#3b82f6');
    const confHov  = o.confirmHoverBg || (isDanger ? '#dc2626' : '#2563eb');
    const icoColor = o.iconColor      || (isDanger ? '#ef4444' : '#3b82f6');
    const icoBg    = o.iconBg         || (isDanger ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)');
    const iconHtml = o.icon           || ICONS.warning;
    const bodyParts = o.padding.trim().split(/\s+/);
    const padH      = bodyParts[1] || bodyParts[0];
    const overlay = document.createElement('div');
    overlay.setAttribute('style', [
      'position:fixed', 'inset:0', 'z-index:99999',
      'display:flex', `align-items:${alignItems}`, 'justify-content:center',
      overlayPad, `background:${o.overlayBg}`,
      `backdrop-filter:blur(${o.overlayBlur})`,
      `-webkit-backdrop-filter:blur(${o.overlayBlur})`,
      'transition:opacity 0.25s ease', 'opacity:0',
    ].join(';'));
    overlay.innerHTML = `
      <div data-mb style="width:100%;max-width:${o.maxWidth};background:${o.bg};border-radius:${o.borderRadius};border:${o.borderWidth} solid ${o.borderColor};box-shadow:${o.shadow};overflow:hidden;transition:all 0.32s cubic-bezier(0.34,1.56,0.64,1);transform:scale(0.9) translateY(18px);">
        <div style="padding:${o.padding}">
          <div style="width:${o.iconSize};height:${o.iconSize};border-radius:${o.iconRadius};background:${icoBg};display:flex;align-items:center;justify-content:center;margin-bottom:16px;color:${icoColor};">
            <div style="width:24px;height:24px">${iconHtml}</div>
          </div>
          <h3 style="font-size:${o.titleSize};font-weight:${o.titleWeight};color:${o.titleColor};margin:${o.titleMargin};line-height:1.3">${title}</h3>
          <p style="font-size:${o.messageSize};color:${o.messageColor};margin:0;line-height:1.65">${message}</p>
        </div>
        <div style="background:${o.footerBg};padding:${o.footerPaddingV} ${padH} ${o.footerPaddingVB};display:flex;gap:10px;justify-content:flex-end;border-top:1px solid ${o.footerBorder}">
          <button data-mc style="padding:${o.cancelPadding};font-size:${o.cancelSize};font-weight:${o.cancelWeight};color:${o.cancelColor};background:${o.cancelBg};border:${o.cancelBorder};border-radius:${o.cancelRadius};cursor:pointer;transition:background 0.15s,color 0.15s">${o.cancelLabel}</button>
          <button data-mok style="padding:${o.confirmPadding};font-size:${o.confirmSize};font-weight:${o.confirmWeight};color:${o.confirmColor};background:${confBg};border:none;border-radius:${o.confirmRadius};cursor:pointer;box-shadow:0 2px 8px ${confBg}55;transition:background 0.15s,transform 0.1s">${o.confirmLabel}</button>
        </div>
      </div>
    `.trim();
    document.body.appendChild(overlay);
    const box  = overlay.querySelector('[data-mb]');
    const conf = overlay.querySelector('[data-mok]');
    const canc = overlay.querySelector('[data-mc]');
    conf.addEventListener('mouseenter', () => { conf.style.background = confHov; conf.style.transform = 'translateY(-1px)'; });
    conf.addEventListener('mouseleave', () => { conf.style.background = confBg;  conf.style.transform = ''; });
    canc.addEventListener('mouseenter', () => { canc.style.background = o.cancelHoverBg; });
    canc.addEventListener('mouseleave', () => { canc.style.background = o.cancelBg; });
    requestAnimationFrame(() => { overlay.style.opacity = '1'; box.style.transform = 'scale(1) translateY(0)'; });
    const close = (result) => {
      overlay.style.opacity = '0'; box.style.transform = 'scale(0.9) translateY(16px)';
      setTimeout(() => { overlay.remove(); resolve(result); }, 280);
    };
    canc.onclick = () => close(false);
    conf.onclick = () => close(true);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    const onKey = (e) => {
      if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', onKey); }
      if (e.key === 'Enter')  { close(true);  document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Backward-compatible: toast(msg, type) still works.
 * Also callable as toast.success(), toast.error(), etc.
 */
export function toast(message, type = 'success', options = {}) {
  return createToast(message, { type, ...options });
}

toast.success         = (msg, opts) => createToast(msg, { type: 'success', ...opts });
toast.error           = (msg, opts) => createToast(msg, { type: 'error',   ...opts });
toast.warning         = (msg, opts) => createToast(msg, { type: 'warning', ...opts });
toast.info            = (msg, opts) => createToast(msg, { type: 'info',    ...opts });
toast.notify          = createToast;
toast.promise         = promiseToast;
toast.anchored        = anchoredToast;
toast.anchoredConfirm = anchoredConfirm;
toast.modal           = modalConfirm;
toast.dismiss         = dismissToast;
toast.dismissAll      = dismissAll;
toast.configure       = configure;
toast.ICONS           = ICONS;

export default toast;
