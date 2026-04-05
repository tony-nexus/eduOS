---
tags: [melhorias, backlog, features]
links: [[MOC]], [[debitos-tecnicos]]
---

# 📈 Backlog de Features

## 🔴 Alta Prioridade

- [ ] **Edge Function: verificação pública de certificado** — `certificado.html` depende disso
- [ ] **Auth Hook configurado no Supabase** — sem isso, `tenant_id` não vai no JWT
- [ ] **Cron job: `fn_mark_pagamentos_atrasados`** — atualização automática de inadimplência

## 🟡 Média Prioridade

- [ ] **Portal do Aluno** — login via `alunos.user_id`, visualização de matrículas e certificados
- [ ] **Portal do Instrutor** — login via `instrutores.user_id`, ver turmas atribuídas
- [ ] **mod-planning-engine** — planejamento inteligente de turmas
- [ ] **mod-sla-calculator** — SLA de cursos e alertas proativos
- [ ] **Exportação de relatórios** — PDF/Excel dos módulos financeiro e relatórios

## 🟢 Baixa Prioridade

- [ ] **Notificações in-app** — alertas de renovação push para usuários
- [ ] **Integração de pagamento** — PagSeguro/Stripe para cobrança online
- [ ] **App mobile** — PWA ou React Native
- [ ] **Tabulator.js** — tabelas com paginação server-side

## ✅ Concluído

- [x] CRUD completo: alunos, turmas, cursos, instrutores, matrículas, pagamentos, certificados
- [x] Multi-tenancy com RLS
- [x] RBAC com guard de rota
- [x] Pipeline Kanban
- [x] Alertas de renovação
- [x] Guard de capacidade de turmas

## Links

- [[debitos-tecnicos]]
- [[mod-planning-engine]]
- [[mod-sla-calculator]]
