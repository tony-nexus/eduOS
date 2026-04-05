/**
 * /js/ui/theme.js
 * Ciclo de 4 temas com persistência em localStorage.
 * Ordem: neon-glass → ocean-glass → dark → light → (volta)
 */

const STORAGE_KEY = 'eduos-theme';
const THEMES = ['neon-glass', 'ocean-glass', 'dark', 'light'];

const ICONS = {
  'neon-glass':  'fa-terminal',
  'ocean-glass': 'fa-droplet',
  'dark':        'fa-moon',
  'light':       'fa-sun',
};

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY) ?? 'neon-glass';
  applyTheme(saved);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') ?? 'neon-glass';
  const idx  = THEMES.indexOf(current);
  const next = THEMES[(idx + 1) % THEMES.length];
  applyTheme(next);
  localStorage.setItem(STORAGE_KEY, next);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  const icon = btn.querySelector('i');
  if (!icon) return;

  // Remove todos os ícones possíveis
  Object.values(ICONS).forEach(cls => icon.classList.remove(cls));
  // Aplica o ícone do tema ativo
  icon.classList.add(ICONS[theme] ?? 'fa-terminal');
}
