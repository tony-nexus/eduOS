/**
 * /js/core/init.js
 * Ponto de entrada do EduOS.
 *
 * CORREÇÕES APLICADAS:
 *  - registerEventListeners() chamado ANTES do await initAuth() (fix race condition)
 *  - Hamburger mobile: abre/fecha sidebar via drawer overlay
 *  - Botão de busca mobile (ícone lupa no topbar)
 */

import { doLogin, logout, initAuth } from './auth.js';
import { navigate } from './router.js';
import { initTheme, toggleTheme } from '../ui/theme.js';
import { closeModal } from '../ui/components.js';

async function bootstrap() {
  initTheme();

  // CORREÇÃO: listeners registrados ANTES do await para evitar race condition
  registerEventListeners();

  const hasSession = await initAuth();

  if (!hasSession) {
    document.getElementById('login-screen').style.display = '';
  }
}

function registerEventListeners() {

  // ── Login email + senha ───────────────────────────────────────────────────
  document.getElementById('login-btn')?.addEventListener('click', () => {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-pass').value;
    doLogin(email, password);
  });

  ['login-email', 'login-pass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('login-btn')?.click();
    });
  });

  // ── Demo chips (Removido) ──────────────────────────────────────────────────


  // ── Logout ────────────────────────────────────────────────────────────────
  document.getElementById('user-chip-logout')?.addEventListener('click', () => logout());

  // ── Navegação sidebar ─────────────────────────────────────────────────────
  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => {
      navigate(item.dataset.page);
      // Fecha drawer mobile após navegar
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebar-overlay')?.classList.remove('open');
    });
  });

  // ── Hamburger mobile ──────────────────────────────────────────────────────
  document.getElementById('hamburger-btn')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('sidebar-overlay')?.classList.toggle('open');
  });

  // ── Overlay fecha sidebar ─────────────────────────────────────────────────
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('open');
  });

  // ── Modal backdrop ────────────────────────────────────────────────────────
  document.getElementById('modal-backdrop')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-backdrop')) closeModal();
  });

  document.getElementById('modal-close-btn')?.addEventListener('click', () => closeModal());

  // ── Escape fecha modal ────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // ── Toggle de tema ────────────────────────────────────────────────────────
  document.getElementById('theme-toggle')?.addEventListener('click', () => toggleTheme());
}

bootstrap();
