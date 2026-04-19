/**
 * /js/ui/branding.js
 * Aplica as configurações de White-label do tenant ao DOM e às variáveis CSS.
 * Chamado após login e ao salvar configurações de aparência.
 */

const STYLE_ID = 'tenant-branding';

/**
 * Busca dados do tenant e aplica o branding.
 * Requer currentUser já populado em globalThis.__eduos_auth.
 */
export async function loadAndApplyBranding() {
  try {
    const { supabase, getTenantId } = await import('../core/supabase.js');
    const tenantId = getTenantId();
    if (!tenantId) return;

    const { data: tenant } = await supabase
      .from('tenants')
      .select('nome, logo_url, cor_primaria, cor_secundaria, tema_padrao')
      .eq('id', tenantId)
      .single();

    if (tenant) applyBranding(tenant);
  } catch (_) { /* branding não crítico */ }
}

/**
 * Aplica um objeto tenant ao DOM (pode ser chamado para preview em tempo real).
 * @param {Object} tenant - { nome, logo_url, cor_primaria, cor_secundaria, tema_padrao }
 */
export function applyBranding(tenant) {
  if (!tenant) return;

  _applyColors(tenant.cor_primaria, tenant.cor_secundaria);
  _applyLogo(tenant.logo_url, tenant.nome);
  _applyTheme(tenant.tema_padrao);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _applyColors(primary, secondary) {
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  const rules = [];

  if (primary && /^#[0-9a-fA-F]{6}$/.test(primary)) {
    const soft = _hexToRgba(primary, 0.12);
    rules.push(`
      :root,
      [data-theme="dark"],
      [data-theme="light"],
      [data-theme="neon-glass"],
      [data-theme="ocean-glass"] {
        --accent:       ${primary};
        --accent-soft:  ${soft};
        --accent-hover: ${primary};
        --green:        ${primary};
        --green-soft:   ${soft};
      }
    `);
  }

  if (secondary && /^#[0-9a-fA-F]{6}$/.test(secondary)) {
    const softSec = _hexToRgba(secondary, 0.12);
    rules.push(`
      :root,
      [data-theme="dark"],
      [data-theme="light"],
      [data-theme="neon-glass"],
      [data-theme="ocean-glass"] {
        --blue:      ${secondary};
        --blue-soft: ${softSec};
      }
    `);
  }

  style.textContent = rules.join('\n');
}

function _applyLogo(logoUrl, nome) {
  const letter = (nome?.[0] ?? 'E').toUpperCase();

  const brandIcon  = document.querySelector('.sidebar-brand-icon');
  const loginIcon  = document.querySelector('.login-logo-icon');

  if (logoUrl) {
    const imgStyle = 'width:28px;height:28px;object-fit:contain;border-radius:4px;display:block;';
    if (brandIcon) brandIcon.innerHTML = `<img src="${logoUrl}" alt="Logo" style="${imgStyle}">`;
    if (loginIcon) loginIcon.innerHTML = `<img src="${logoUrl}" alt="Logo" style="${imgStyle}">`;
  } else {
    if (brandIcon) brandIcon.textContent = letter;
    if (loginIcon) loginIcon.textContent = letter;
  }

  // Atualiza o nome na sidebar se couber sem truncar demais
  const brandName = document.querySelector('.sidebar-brand-name');
  if (brandName && nome) {
    const display = nome.length <= 14 ? nome : nome.substring(0, 13) + '…';
    brandName.innerHTML = display;
  }
}

function _applyTheme(tema) {
  if (!tema) return;
  // Só aplica se o usuário não tiver uma preferência pessoal salva
  if (!localStorage.getItem('eduos-theme')) {
    document.documentElement.setAttribute('data-theme', tema);
  }
}

function _hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
