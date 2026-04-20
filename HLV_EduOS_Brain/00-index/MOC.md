---
tags: [moc, index, hlv-eduos]
aliases: [Home, Índice, Central]
---

# 🧠 MOC — HLV EduOS

> **Map of Content** central do projeto. Todos os nós do grafo partem daqui.
> Stack: **Vanilla JS · Supabase · Multi-tenant SaaS**

---

## 🏗️ Arquitetura

- [[arquitetura-componentes]] — Estrutura de arquivos e camadas
- [[visao-geral]] — Visão macro do sistema

---

## 📦 Módulos (Views)

| Módulo | Descrição | Rota |
|---|---|---|
| [[mod-auth]] | Autenticação Supabase + RBAC | `login` |
| [[mod-dashboard]] | KPIs, Pipeline, Alertas, Financeiro | `dashboard` |
| [[mod-alunos]] | CRUD completo de alunos | `alunos` |
| [[mod-turmas]] | CRUD Turmas + controle de vagas | `turmas` |
| [[mod-cursos]] | CRUD Cursos com código único | `cursos` |
| [[mod-instrutores]] | CRUD Instrutores com avaliação | `instrutores` |
| [[mod-matriculas]] | Matrículas + geração de pagamento | `matriculas` |
| [[mod-pipeline]] | Kanban drag-and-drop de matrículas | `pipeline` |
| [[mod-certificados]] | Emissão, validade, verificação pública | `certificados` |
| [[mod-financeiro]] | Pagamentos + marcação de atraso | `financeiro` |
| [[mod-renovacoes]] | Alertas de certificados a vencer | `renovacoes` |
| [[mod-relatorios]] | Agregados financeiros e operacionais | `relatorios` |
| [[mod-rbac]] | Permissões por perfil | `rbac` |
| [[mod-configuracoes]] | Configurações do tenant | `configuracoes` |
| [[mod-empresas]] | Empresas B2B vinculadas a alunos | `empresas` |
| [[mod-planning-engine]] | Engine de planejamento de turmas | interno |
| [[mod-security]] | Segurança, RLS, Auth Hook | interno |
| [[mod-sla-calculator]] | Calculadora de SLA de cursos | interno |
| [[mod-utils]] | Helpers: fmtDate, fmtMoney, toast | interno |
| [[mod-date-picker]] | Componente calendário reutilizável | componente |
| [[mod-global-filters]] | Filtros globais de contexto | componente |
| [[mod-filter-multiselect]] | Multi-seleção de filtros | componente |

---

## 🗄️ Banco de Dados

- [[modelo-registro]] — Diagrama ER e todas as tabelas
- [[schema-xlsx-import]] — Schema SQL completo
- [[debitos-tecnicos]] — Débitos e TODOs no banco
- [[storage-local]] — Uso de localStorage / sessionStorage

---

## 🔌 API

- [[api-modulos]] — Referência das chamadas Supabase por módulo
- [[api-sla-calculator]] — Endpoints do calculador de SLA
- [[api-global-filters]] — API dos filtros globais

---

## 🔄 Fluxos

- [[fluxo-autenticacao]] — Login → JWT → Auth Hook → tenant_id
- [[fluxo-calculo-sla]] — Cálculo de SLA de cursos
- [[fluxo-planejamento]] — Planejamento de turmas
- [[fluxo-importacao-dados]] — Importação de dados via XLSX

---

## 📈 Melhorias

- [[backlog-features]] — Funcionalidades planejadas

---

## ⚖️ Decisões Técnicas

- [[decisao-stack-vanilla]] — Por que Vanilla JS sem framework
- [[decisao-security-crypto]] — Estratégia de segurança e criptografia
- [[decisao-tabulator]] — Escolha da lib de tabelas
