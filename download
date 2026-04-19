/**
 * /js/views/rbac.js
 */

import { setContent, toast } from '../ui/components.js';

const PERFIS = [
  {nome:'Super Admin',  cor:'var(--red)',    desc:'Operador da plataforma SaaS. Acesso total entre tenants.', permissoes:['Tudo — cross-tenant']},
  {nome:'Admin',        cor:'var(--accent)', desc:'Gestor da instituição. Acesso completo dentro do tenant.', permissoes:['Todos os módulos','Gestão de usuários','Configurações','Relatórios']},
  {nome:'Coordenador',  cor:'var(--blue)',   desc:'Foco acadêmico e pedagógico.', permissoes:['Alunos (R)','Turmas (R+W)','Diário (R+W)','Certificados (R+W)','Relatórios']},
  {nome:'Secretaria',   cor:'var(--purple)', desc:'Atendimento e documentação.', permissoes:['Alunos (R+W)','Matrículas (R+W)','Certificados (R+W)','Empresas (R)']},
  {nome:'Financeiro',   cor:'var(--green)',  desc:'Cobranças e recebimentos.', permissoes:['Pagamentos (R+W)','Relatórios financeiros','Empresas (R)']},
  {nome:'Comercial',    cor:'var(--amber)',  desc:'Pipeline de vendas e renovações.', permissoes:['Alunos (R+W)','Pipeline (R)','Renovações (R+W)','Empresas (R+W)']},
  {nome:'Instrutor',    cor:'var(--blue)',   desc:'Somente suas turmas vinculadas.', permissoes:['Turmas próprias (R)','Diário próprio (R+W)','Alunos de suas turmas (R)','Certificados (R)']},
  {nome:'Aluno',        cor:'var(--text-secondary)', desc:'Portal de autoatendimento.', permissoes:['Próprias matrículas (R)','Próprios certificados (R)','Próprio histórico (R)']},
];

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Permissões RBAC</h1><p>Controle de acesso baseado em perfis</p></div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-novo-perfil">Novo Perfil</button>
      </div>
    </div>
    <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:var(--radius-lg);padding:20px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px">Princípio de Segurança Multi-Tenant</div>
      <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7">
        Toda operação de banco de dados começa com <code style="background:var(--bg-overlay);padding:1px 6px;border-radius:4px;font-family:var(--font-mono);font-size:11.5px">tenant_id = get_tenant_id()</code> antes de qualquer verificação de perfil — garantindo isolamento total entre instituições. As políticas RLS são aplicadas no nível do banco de dados (PostgreSQL), não apenas na aplicação.
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
      ${PERFIS.map(p => `
        <div class="card" style="padding:18px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
            <div style="width:10px;height:10px;border-radius:50%;background:${p.cor};flex-shrink:0"></div>
            <div style="font-weight:600;font-size:14px">${p.nome}</div>
          </div>
          <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;line-height:1.5">${p.desc}</div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${p.permissoes.map(perm => `
              <div style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-secondary)">
                <svg viewBox="0 0 24 24" fill="none" stroke="${p.cor}" stroke-width="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
                ${perm}
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `);

  document.getElementById('btn-novo-perfil')?.addEventListener('click', () => toast('Novo perfil personalizado em breve', 'warning'));
}
