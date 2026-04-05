/**
 * /js/views/configuracoes.js
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, toast } from '../ui/components.js';

const MENU_ITEMS = ['Instituição','Aparência','Usuários','Integrações','Certificados','Faturamento','Segurança'];

export async function render() {
  setContent(`
    <style>
      .edu-toggle-switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
      .edu-toggle-switch input { opacity: 0; width: 0; height: 0; }
      .edu-toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--border, #334155); transition: background-color 0.3s ease; border-radius: 999px; }
      .edu-toggle-slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: #ffffff; transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1); border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
      .edu-toggle-switch input:checked + .edu-toggle-slider { background-color: #10b981; }
      .edu-toggle-switch input:checked + .edu-toggle-slider:before { transform: translateX(20px); }
      .setting-item { display:flex; justify-content:space-between; align-items:center; gap:24px; margin-bottom: 20px; }
      .setting-item:last-child { margin-bottom: 0; }
      .setting-label { font-size: 0.95rem; font-weight: 500; margin-bottom: 4px; display: block; }
      .setting-desc { font-size: 0.85rem; color: var(--text-secondary); margin: 0; line-height: 1.4; }
    </style>
    <div class="page-header">
      <div><h1>Configurações</h1><p>Personalização e configurações da instituição</p></div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-salvar-config">Salvar Alterações</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:220px 1fr;gap:20px;align-items:start">
      <div class="card" style="padding:8px">
        ${MENU_ITEMS.map((item, i) => `
          <div class="config-menu-item" data-idx="${i}" style="padding:9px 12px;border-radius:var(--radius-sm);cursor:pointer;display:flex;align-items:center;gap:9px;font-size:13px;transition:all 0.15s;color:${i===0?'var(--accent)':'var(--text-secondary)'};background:${i===0?'var(--accent-soft)':'transparent'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="15" height="15"><circle cx="12" cy="12" r="10"/></svg>
            ${item}
          </div>
        `).join('')}
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <div class="card-header"><span class="card-title">Dados da Instituição</span></div>
          <div class="card-body">
            <div class="form-grid">
              <div class="form-group full"><label>Nome da Escola</label><input type="text" value="EduOS Demo School"></div>
              <div class="form-group"><label>CNPJ</label><input type="text" value="00.000.000/0001-00"></div>
              <div class="form-group"><label>Telefone</label><input type="text" value="(11) 3000-0000"></div>
              <div class="form-group full"><label>E-mail</label><input type="email" value="contato@escola.edu.br"></div>
              <div class="form-group full"><label>Site</label><input type="url" value="https://escola.edu.br"></div>
              <div class="form-group full"><label>Assinante dos Certificados</label><input type="text" value="Diretor Técnico — João da Silva"></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Aparência (White-Label)</span></div>
          <div class="card-body">
            <div class="form-grid">
              <div class="form-group"><label>Cor Principal</label><input type="color" value="#cc785c" style="height:40px;padding:4px"></div>
              <div class="form-group"><label>Cor Secundária</label><input type="color" value="#5b8af0" style="height:40px;padding:4px"></div>
              <div class="form-group"><label>Tema Padrão</label><select><option>Dark</option><option>Light</option><option>Seguir sistema</option></select></div>
              <div class="form-group"><label>Raio de Borda (px)</label><input type="number" value="10" min="0" max="20"></div>
              <div class="form-group full"><label>URL do Logo</label><input type="url" placeholder="https://...logo.png"></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <span class="card-title">Alertas por E-mail</span>
            <span style="font-size:10px;text-transform:uppercase;color:#10b981;font-weight:600;letter-spacing:0.05em;">Acadêmico / Comercial</span>
          </div>
          <div class="card-body">
            <div class="setting-item">
              <div>
                <span class="setting-label">Aviso de 30 dias</span>
                <p class="setting-desc">Envia uma notificação inicial um mês antes do vencimento do certificado.</p>
              </div>
              <label class="edu-toggle-switch"><input type="checkbox" id="config-30-dias" checked><span class="edu-toggle-slider"></span></label>
            </div>
            <div class="setting-item">
              <div>
                <span class="setting-label">Aviso de 7 dias</span>
                <p class="setting-desc">Lembrete final antes do certificado expirar solicitando ação imediata.</p>
              </div>
              <label class="edu-toggle-switch"><input type="checkbox" id="config-7-dias" checked><span class="edu-toggle-slider"></span></label>
            </div>
            <div class="setting-item">
              <div>
                <span class="setting-label">Certificado Expirado</span>
                <p class="setting-desc">Aviso enviado no exato dia em que o certificado foi anulado ou expirou.</p>
              </div>
              <label class="edu-toggle-switch"><input type="checkbox" id="config-expirado"><span class="edu-toggle-slider"></span></label>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Plano Atual</span><span class="badge badge-green">Pro</span></div>
          <div class="card-body">
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;font-size:13px">
              <div style="padding:14px;background:var(--bg-elevated);border-radius:var(--radius-sm)">
                <div style="color:var(--text-tertiary);font-size:11px;margin-bottom:4px">ALUNOS ATIVOS</div>
                <div style="font-size:18px;font-weight:600;font-family:var(--font-mono)">248 <span style="font-size:12px;color:var(--text-tertiary)">/ 500</span></div>
              </div>
              <div style="padding:14px;background:var(--bg-elevated);border-radius:var(--radius-sm)">
                <div style="color:var(--text-tertiary);font-size:11px;margin-bottom:4px">ARMAZENAMENTO</div>
                <div style="font-size:18px;font-weight:600;font-family:var(--font-mono)">2.4 <span style="font-size:12px;color:var(--text-tertiary)">GB / 20 GB</span></div>
              </div>
              <div style="padding:14px;background:var(--bg-elevated);border-radius:var(--radius-sm)">
                <div style="color:var(--text-tertiary);font-size:11px;margin-bottom:4px">PRÓX. RENOVAÇÃO</div>
                <div style="font-size:18px;font-weight:600;font-family:var(--font-mono)">Mar 2026</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);

  document.getElementById('btn-salvar-config')?.addEventListener('click', () => toast('Configurações salvas!', 'success'));

  // Lógica dos Toggles de Alertas por e-mail
  const toggles = ['config-30-dias', 'config-7-dias', 'config-expirado'];
  toggles.forEach(id => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      toast(`Regra atualizada com sucesso.`, 'success');
      // TODO: Salvar com Supabase usando a tabela de preferências do Tenant
    });
  });

  // Menu de navegação lateral
  document.querySelectorAll('.config-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.config-menu-item').forEach(el => {
        el.style.color = 'var(--text-secondary)';
        el.style.background = 'transparent';
      });
      item.style.color = 'var(--accent)';
      item.style.background = 'var(--accent-soft)';
    });
    item.addEventListener('mouseover', () => {
      if (item.style.color !== 'var(--accent)') {
        item.style.background = 'var(--bg-hover)';
        item.style.color = 'var(--text-primary)';
      }
    });
    item.addEventListener('mouseout', () => {
      if (item.style.color !== 'var(--accent)') {
        item.style.background = 'transparent';
        item.style.color = 'var(--text-secondary)';
      }
    });
  });
}
