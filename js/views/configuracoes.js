/**
 * /js/views/configuracoes.js
 * Configurações do tenant — White-label + dados institucionais + alertas.
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, toast } from '../ui/components.js';
import { applyBranding } from '../ui/branding.js';

// ─── Estado do módulo ─────────────────────────────────────────────────────────
let _tenant      = null;
let _activeTab   = 'instituicao';

const TABS = [
  { id: 'instituicao', label: 'Instituição',  icon: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
  { id: 'aparencia',   label: 'Aparência',    icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M4.22 4.22l2.12 2.12m11.32 11.32l2.12 2.12M2 12h3m14 0h3M4.22 19.78l2.12-2.12m11.32-11.32l2.12-2.12"/>' },
  { id: 'alertas',     label: 'Alertas',      icon: '<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>' },
  { id: 'usuarios',    label: 'Usuários',     icon: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>', soon: true },
  { id: 'seguranca',   label: 'Segurança',    icon: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>', soon: true },
  { id: 'faturamento', label: 'Faturamento',  icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>', soon: true },
];

const TEMAS = [
  { value: 'neon-glass',  label: 'Neon Glass (padrão)' },
  { value: 'ocean-glass', label: 'Ocean Glass' },
  { value: 'dark',        label: 'Dark' },
  { value: 'light',       label: 'Light' },
];

// ─── Render principal ─────────────────────────────────────────────────────────
export async function render() {
  setContent(_buildShell());
  _tenant = await _fetchTenant();
  _renderTabContent(_activeTab);
  _bindNav();
}

// ─── Shell (layout fixo com navegação lateral) ────────────────────────────────
function _buildShell() {
  const navItems = TABS.map((t, i) => `
    <button
      class="cfg-nav-item ${i === 0 ? 'active' : ''}"
      data-tab="${t.id}"
      style="display:flex;align-items:center;gap:9px;width:100%;padding:9px 12px;
             border:none;border-radius:var(--radius-sm);cursor:pointer;font-size:13px;
             font-family:var(--font-sans);transition:var(--transition);text-align:left;
             color:${i===0?'var(--accent)':'var(--text-secondary)'};
             background:${i===0?'var(--accent-soft)':'transparent'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15" style="flex-shrink:0">
        ${t.icon}
      </svg>
      <span style="flex:1">${t.label}</span>
      ${t.soon ? '<span style="font-size:9px;font-family:var(--font-mono);color:var(--text-tertiary);padding:2px 5px;border:1px solid var(--border-subtle);border-radius:4px">SOON</span>' : ''}
    </button>
  `).join('');

  return `
    <style>
      .cfg-nav-item:hover:not(.active) { background: var(--bg-hover) !important; color: var(--text-primary) !important; }
      .cfg-toggle { position:relative; display:inline-block; width:44px; height:24px; flex-shrink:0; }
      .cfg-toggle input { opacity:0; width:0; height:0; }
      .cfg-toggle-slider { position:absolute; cursor:pointer; inset:0; background:var(--border-default);
        transition:0.25s; border-radius:999px; }
      .cfg-toggle-slider:before { content:""; position:absolute; width:18px; height:18px;
        left:3px; bottom:3px; background:#fff; border-radius:50%; transition:0.25s;
        box-shadow:0 1px 3px rgba(0,0,0,0.35); }
      .cfg-toggle input:checked + .cfg-toggle-slider { background:var(--accent); }
      .cfg-toggle input:checked + .cfg-toggle-slider:before { transform:translateX(20px); }
      .cfg-setting-row { display:flex; justify-content:space-between; align-items:center;
        gap:24px; padding:16px 0; border-bottom:1px solid var(--border-subtle); }
      .cfg-setting-row:last-child { border-bottom:none; padding-bottom:0; }
      .cfg-preview-swatch { width:32px; height:32px; border-radius:var(--radius-sm);
        border:2px solid var(--border-default); cursor:pointer; }
    </style>
    <div class="page-header">
      <div>
        <h1>Configurações</h1>
        <p>Personalização e configurações da instituição</p>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:220px 1fr;gap:20px;align-items:start">
      <div class="card" style="padding:8px;position:sticky;top:20px">
        ${navItems}
      </div>
      <div id="cfg-tab-content" style="display:flex;flex-direction:column;gap:16px"></div>
    </div>
  `;
}

// ─── Navegação ─────────────────────────────────────────────────────────────────
function _bindNav() {
  document.querySelectorAll('.cfg-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cfg-nav-item').forEach(b => {
        b.classList.remove('active');
        b.style.color      = 'var(--text-secondary)';
        b.style.background = 'transparent';
      });
      btn.classList.add('active');
      btn.style.color      = 'var(--accent)';
      btn.style.background = 'var(--accent-soft)';
      _activeTab = btn.dataset.tab;
      _renderTabContent(_activeTab);
    });
  });
}

// ─── Dispatcher de abas ────────────────────────────────────────────────────────
function _renderTabContent(tab) {
  const container = document.getElementById('cfg-tab-content');
  if (!container) return;

  switch (tab) {
    case 'instituicao': container.innerHTML = _tplInstituicao(); _bindInstituicao(); break;
    case 'aparencia':   container.innerHTML = _tplAparencia();   _bindAparencia();  break;
    case 'alertas':     container.innerHTML = _tplAlertas();     _bindAlertas();    break;
    default:            container.innerHTML = _tplEmBreve(tab);  break;
  }
}

// ─── ABA: Instituição ─────────────────────────────────────────────────────────
function _tplInstituicao() {
  const t = _tenant ?? {};
  return `
    <div class="card">
      <div class="card-header"><span class="card-title">Dados da Instituição</span></div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-group full">
            <label class="form-label">Nome da Instituição *</label>
            <input class="form-input" id="cfg-nome" type="text" value="${_esc(t.nome)}" placeholder="Ex: Centro de Treinamento HLV">
          </div>
          <div class="form-group">
            <label class="form-label">CNPJ</label>
            <input class="form-input" id="cfg-cnpj" type="text" value="${_esc(t.cnpj)}" placeholder="00.000.000/0001-00">
          </div>
          <div class="form-group">
            <label class="form-label">Telefone</label>
            <input class="form-input" id="cfg-telefone" type="text" value="${_esc(t.telefone)}" placeholder="(11) 3000-0000">
          </div>
          <div class="form-group">
            <label class="form-label">E-mail de Contato</label>
            <input class="form-input" id="cfg-email" type="email" value="${_esc(t.email_contato)}" placeholder="contato@escola.edu.br">
          </div>
          <div class="form-group">
            <label class="form-label">Site</label>
            <input class="form-input" id="cfg-site" type="url" value="${_esc(t.site)}" placeholder="https://escola.edu.br">
          </div>
          <div class="form-group full">
            <label class="form-label">Assinante dos Certificados</label>
            <input class="form-input" id="cfg-assinante" type="text" value="${_esc(t.assinante_certificados)}" placeholder="Ex: João da Silva — Diretor Técnico">
          </div>
        </div>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end">
      <button class="btn btn-primary" id="btn-salvar-inst">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Salvar Dados
      </button>
    </div>
  `;
}

function _bindInstituicao() {
  document.getElementById('btn-salvar-inst')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-salvar-inst');
    btn.disabled = true;
    btn.innerHTML = '<span style="opacity:.7">Salvando...</span>';

    const updates = {
      nome:                   document.getElementById('cfg-nome')?.value.trim(),
      cnpj:                   document.getElementById('cfg-cnpj')?.value.trim() || null,
      telefone:               document.getElementById('cfg-telefone')?.value.trim() || null,
      email_contato:          document.getElementById('cfg-email')?.value.trim() || null,
      site:                   document.getElementById('cfg-site')?.value.trim() || null,
      assinante_certificados: document.getElementById('cfg-assinante')?.value.trim() || null,
      updated_at:             new Date().toISOString(),
    };

    if (!updates.nome) {
      toast('O nome da instituição é obrigatório.', 'error');
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Salvar Dados`;
      return;
    }

    const { error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', getTenantId());

    if (error) {
      toast('Erro ao salvar: ' + error.message, 'error');
    } else {
      Object.assign(_tenant, updates);
      // Atualiza o nome na sidebar
      applyBranding({ nome: updates.nome, logo_url: _tenant.logo_url });
      toast('Dados da instituição salvos!', 'success');
    }

    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Salvar Dados`;
  });
}

// ─── ABA: Aparência (White-label) ─────────────────────────────────────────────
function _tplAparencia() {
  const t = _tenant ?? {};
  const primary   = t.cor_primaria   ?? '#63ffab';
  const secondary = t.cor_secundaria ?? '#5b8af0';
  const tema      = t.tema_padrao    ?? 'neon-glass';
  const logo      = t.logo_url       ?? '';

  const temaOptions = TEMAS.map(op =>
    `<option value="${op.value}" ${tema === op.value ? 'selected' : ''}>${op.label}</option>`
  ).join('');

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Cores da Marca</span>
        <span style="font-size:11px;font-family:var(--font-mono);color:var(--text-tertiary)">preview em tempo real</span>
      </div>
      <div class="card-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Cor Principal (Accent)</label>
            <div style="display:flex;align-items:center;gap:10px">
              <input type="color" id="cfg-cor-primary" value="${primary}"
                style="width:44px;height:38px;padding:2px;border:1px solid var(--border-default);
                       border-radius:var(--radius-sm);background:var(--bg-elevated);cursor:pointer">
              <input class="form-input" id="cfg-cor-primary-hex" type="text"
                value="${primary}" placeholder="#63ffab"
                style="flex:1;font-family:var(--font-mono);font-size:12px">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Cor Secundária</label>
            <div style="display:flex;align-items:center;gap:10px">
              <input type="color" id="cfg-cor-secondary" value="${secondary}"
                style="width:44px;height:38px;padding:2px;border:1px solid var(--border-default);
                       border-radius:var(--radius-sm);background:var(--bg-elevated);cursor:pointer">
              <input class="form-input" id="cfg-cor-secondary-hex" type="text"
                value="${secondary}" placeholder="#5b8af0"
                style="flex:1;font-family:var(--font-mono);font-size:12px">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Tema Padrão da Plataforma</label>
            <select class="form-input" id="cfg-tema">${temaOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">URL do Logo</label>
            <input class="form-input" id="cfg-logo" type="url"
              value="${_esc(logo)}" placeholder="https://...logo.png">
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><span class="card-title">Pré-visualização</span></div>
      <div class="card-body">
        <div id="cfg-preview" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:8px">
            <div id="prev-accent-chip"
              style="width:36px;height:36px;border-radius:var(--radius-sm);background:${primary}"></div>
            <div>
              <div style="font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono)">ACCENT</div>
              <div id="prev-accent-hex" style="font-size:13px;font-family:var(--font-mono)">${primary}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div id="prev-secondary-chip"
              style="width:36px;height:36px;border-radius:var(--radius-sm);background:${secondary}"></div>
            <div>
              <div style="font-size:11px;color:var(--text-tertiary);font-family:var(--font-mono)">SECUNDÁRIA</div>
              <div id="prev-secondary-hex" style="font-size:13px;font-family:var(--font-mono)">${secondary}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" id="prev-btn-primary" style="background:${primary};border-color:${primary}">Botão Primário</button>
            <span class="badge" id="prev-badge" style="background:${primary}1a;color:${primary};font-family:var(--font-mono)">badge</span>
          </div>
        </div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:10px">
      <button class="btn btn-secondary" id="btn-reset-aparencia">Descartar</button>
      <button class="btn btn-primary" id="btn-salvar-aparencia">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Salvar e Aplicar
      </button>
    </div>
  `;
}

function _bindAparencia() {
  const primaryPicker    = document.getElementById('cfg-cor-primary');
  const primaryHex       = document.getElementById('cfg-cor-primary-hex');
  const secondaryPicker  = document.getElementById('cfg-cor-secondary');
  const secondaryHex     = document.getElementById('cfg-cor-secondary-hex');

  // Sincroniza color picker ↔ input de texto e dispara preview
  function syncColor(picker, hexInput, isSecondary) {
    picker?.addEventListener('input', () => {
      hexInput.value = picker.value;
      _previewColors(
        isSecondary ? primaryPicker.value : picker.value,
        isSecondary ? picker.value : secondaryPicker.value
      );
    });
    hexInput?.addEventListener('input', () => {
      const v = hexInput.value;
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        picker.value = v;
        _previewColors(
          isSecondary ? primaryPicker.value : v,
          isSecondary ? v : secondaryPicker.value
        );
      }
    });
  }

  syncColor(primaryPicker, primaryHex, false);
  syncColor(secondaryPicker, secondaryHex, true);

  // Descartar
  document.getElementById('btn-reset-aparencia')?.addEventListener('click', () => {
    _renderTabContent('aparencia');
    applyBranding(_tenant);
    toast('Alterações descartadas.', 'info');
  });

  // Salvar
  document.getElementById('btn-salvar-aparencia')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-salvar-aparencia');
    btn.disabled = true;
    btn.innerHTML = '<span style="opacity:.7">Aplicando...</span>';

    const updates = {
      cor_primaria:   primaryHex.value.trim()   || null,
      cor_secundaria: secondaryHex.value.trim() || null,
      tema_padrao:    document.getElementById('cfg-tema')?.value || 'neon-glass',
      logo_url:       document.getElementById('cfg-logo')?.value.trim() || null,
      updated_at:     new Date().toISOString(),
    };

    const { error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', getTenantId());

    if (error) {
      toast('Erro ao salvar: ' + error.message, 'error');
    } else {
      Object.assign(_tenant, updates);
      applyBranding(_tenant);
      toast('Aparência aplicada com sucesso!', 'success');
    }

    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Salvar e Aplicar`;
  });
}

function _previewColors(primary, secondary) {
  // Atualiza chips de preview
  const chip1 = document.getElementById('prev-accent-chip');
  const hex1  = document.getElementById('prev-accent-hex');
  const chip2 = document.getElementById('prev-secondary-chip');
  const hex2  = document.getElementById('prev-secondary-hex');
  const btnP  = document.getElementById('prev-btn-primary');
  const badge = document.getElementById('prev-badge');

  if (chip1) chip1.style.background = primary;
  if (hex1)  hex1.textContent        = primary;
  if (chip2) chip2.style.background = secondary;
  if (hex2)  hex2.textContent        = secondary;
  if (btnP)  { btnP.style.background = primary; btnP.style.borderColor = primary; }
  if (badge) { badge.style.background = primary + '1a'; badge.style.color = primary; }

  // Aplica no app em tempo real
  applyBranding({ cor_primaria: primary, cor_secundaria: secondary });
}

// ─── ABA: Alertas ─────────────────────────────────────────────────────────────
function _tplAlertas() {
  const alertas = _tenant?.alertas_renovacao ?? { dias_30: true, dias_7: true, expirado: false };

  const rows = [
    {
      id: 'alert-30',
      key: 'dias_30',
      label: 'Aviso 30 dias antes',
      desc: 'Notificação inicial um mês antes do vencimento do certificado.',
      checked: alertas.dias_30,
    },
    {
      id: 'alert-7',
      key: 'dias_7',
      label: 'Aviso 7 dias antes',
      desc: 'Lembrete final antes do certificado expirar, solicitando ação imediata.',
      checked: alertas.dias_7,
    },
    {
      id: 'alert-exp',
      key: 'expirado',
      label: 'Certificado expirado',
      desc: 'Aviso enviado no dia em que o certificado expirou.',
      checked: alertas.expirado,
    },
  ];

  return `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Alertas de Renovação</span>
        <span style="font-size:11px;font-family:var(--font-mono);color:var(--text-tertiary)">salvo automaticamente</span>
      </div>
      <div class="card-body" style="padding-bottom:4px">
        ${rows.map(r => `
          <div class="cfg-setting-row">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);margin-bottom:4px">${r.label}</div>
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.4">${r.desc}</div>
            </div>
            <label class="cfg-toggle" title="${r.label}">
              <input type="checkbox" id="${r.id}" data-key="${r.key}" ${r.checked ? 'checked' : ''}>
              <span class="cfg-toggle-slider"></span>
            </label>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Sobre os Alertas</span></div>
      <div class="card-body">
        <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin:0">
          Os alertas de renovação são exibidos no módulo <strong style="color:var(--text-primary)">Renovações</strong>
          e futuramente disparados por e-mail para os responsáveis das empresas B2B e para os próprios alunos.
          A configuração se aplica a todos os usuários desta instituição.
        </p>
      </div>
    </div>
  `;
}

function _bindAlertas() {
  document.querySelectorAll('.cfg-toggle input[data-key]').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const key     = e.target.dataset.key;
      const checked = e.target.checked;

      const alertas = { ...(_tenant?.alertas_renovacao ?? {}), [key]: checked };

      const { error } = await supabase
        .from('tenants')
        .update({ alertas_renovacao: alertas, updated_at: new Date().toISOString() })
        .eq('id', getTenantId());

      if (error) {
        toast('Erro ao salvar alerta.', 'error');
        e.target.checked = !checked; // reverte
      } else {
        if (_tenant) _tenant.alertas_renovacao = alertas;
        toast('Preferência salva.', 'success');
      }
    });
  });
}

// ─── ABA: Em Breve ─────────────────────────────────────────────────────────────
function _tplEmBreve(tab) {
  const t = TABS.find(x => x.id === tab);
  return `
    <div class="card">
      <div class="card-body" style="text-align:center;padding:60px 24px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"
          width="48" height="48" style="color:var(--text-tertiary);margin-bottom:16px">
          ${t?.icon ?? '<circle cx="12" cy="12" r="10"/>'}
        </svg>
        <div style="font-size:16px;font-weight:600;margin-bottom:8px">${t?.label ?? tab}</div>
        <div style="font-size:13px;color:var(--text-secondary);max-width:320px;margin:0 auto;line-height:1.6">
          Esta seção está em desenvolvimento e será disponibilizada em breve.
        </div>
      </div>
    </div>
  `;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function _fetchTenant() {
  const { data, error } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', getTenantId())
    .single();

  if (error) {
    toast('Erro ao carregar configurações.', 'error');
    return {};
  }
  return data;
}

function _esc(val) {
  if (!val) return '';
  return String(val).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
