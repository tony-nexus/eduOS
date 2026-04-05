/**
 * /js/ui/theme.js
 * Toggle de tema dark/light com persistência em localStorage.
 */

const STORAGE_KEY = 'eduos-theme';

export function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY) ?? 'dark';
  applyTheme(saved);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') ?? 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(STORAGE_KEY, next);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.classList.toggle('on', theme === 'light');
}
