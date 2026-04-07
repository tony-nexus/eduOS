---
tags: [arquitetura, visao-geral]
links: [[MOC]], [[arquitetura-componentes]]
---

# 🌐 Visão Geral — HLV EduOS

## O que é

**HLV EduOS** é um sistema de gestão educacional multi-tenant (SaaS) construído com Vanilla JS no frontend e Supabase (PostgreSQL + Auth + RLS) como backend. Voltado para escolas técnicas, centros de treinamento e autoescolas.

---

## Stack Completa

```
┌─────────────────────────────────────────────┐
│  FRONTEND (Vanilla JS · SPA)                │
│  index.html → js/core/init.js               │
│  ├── Router (hash-based)                    │
│  ├── Auth (Supabase Auth)                   │
│  ├── Views (14 módulos)                     │
│  └── UI (components, charts, theme)         │
├─────────────────────────────────────────────┤
│  BACKEND (Supabase)                         │
│  ├── PostgreSQL (9 tabelas + views)         │
│  ├── Row Level Security (RLS)               │
│  ├── Auth Hook → injeta tenant_id no JWT   │
│  └── Edge Functions (certificados públicos) │
└─────────────────────────────────────────────┘
```

---

## Multi-tenancy

Todas as tabelas possuem `tenant_id UUID NOT NULL`. O `tenant_id` é injetado no JWT pelo Auth Hook do Supabase e recuperado via `get_tenant_id()` no RLS.

```sql
-- Função central de segurança
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
$$ LANGUAGE sql STABLE;
```

---

## Perfis de usuário (RBAC)

```
super_admin  → acesso irrestrito a tudo
admin        → acesso irrestrito ao tenant
coordenador  → dashboard, alunos, turmas, cursos, instrutores, pipeline, certificados, renovações, relatórios
secretaria   → dashboard, alunos, turmas, cursos, instrutores, matrículas, pipeline, certificados, empresas, renovações
financeiro   → dashboard, empresas, financeiro, relatórios
comercial    → dashboard, alunos, matrículas, pipeline, empresas, renovações
instrutor    → dashboard, turmas
aluno        → (portal futuro)
```

---

## Links relacionados

- [[arquitetura-componentes]]
- [[mod-auth]]
- [[modelo-registro]]
- [[fluxo-autenticacao]]
