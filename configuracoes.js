/**
 * /js/ui/loading.js
 * Tela de loading pós-login — animação de barra + mensagens de sistema.
 * Disparada apenas no fluxo de doLogin() (não na restauração de sessão).
 */

const MESSAGES = [
  '> autenticando_sessão...',
  '> carregando_perfil...',
  '> sincronizando_dados...',
  '> verificando_permissões...',
  '> montando_módulos...',
  '> preparando_interface...',
  '> sistema_pronto.',
];

export function showLoadingScreen() {
  const screen  = document.getElementById('loading-screen');
  const barFill = document.getElementById('ls-bar-fill');
  const status  = document.getElementById('ls-status');
  const percent = document.getElementById('ls-percent');

  if (!screen) return;

  // Reseta estado
  screen.style.display = 'flex';
  screen.classList.remove('ls-fade-out');
  barFill.style.width = '0%';
  percent.textContent = '0%';
  status.textContent  = MESSAGES[0];

  let progress = 0;
  let msgIdx   = 0;

  const interval = setInterval(() => {
    progress += Math.floor(Math.random() * 12) + 3;

    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);

      barFill.style.width  = '100%';
      percent.textContent  = '100%';
      status.textContent   = MESSAGES[MESSAGES.length - 1];

      setTimeout(() => {
        screen.classList.add('ls-fade-out');
        setTimeout(() => {
          screen.style.display = 'none';
          screen.classList.remove('ls-fade-out');
        }, 600);
      }, 400);

    } else {
      barFill.style.width = `${progress}%`;
      percent.textContent = `${progress}%`;

      const expectedIdx = Math.floor((progress / 100) * (MESSAGES.length - 1));
      if (expectedIdx !== msgIdx && expectedIdx < MESSAGES.length) {
        msgIdx = expectedIdx;
        status.textContent = MESSAGES[msgIdx];
      }
    }
  }, 180);
}
