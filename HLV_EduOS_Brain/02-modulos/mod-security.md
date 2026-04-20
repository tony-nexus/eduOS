---
tags: [modulo, seguranca, rls, supabase]
links: [[MOC]], [[mod-auth]], [[mod-rbac]], [[decisao-security-crypto]]
---

# 🛡️ mod-security — Segurança

**Arquivos:** `SQL/01_Fix_RLS.sql`, `SQL/Chain_hlv.sql`

## Camadas de Segurança

### 1. Autenticação (Supabase Auth)
- JWT com `tenant_id` injetado via Auth Hook
- `get_tenant_id()` lê o JWT sem query adicional

### 2. Row Level Security (RLS)
- Todas as tabelas têm RLS habilitado
- Policies usam `get_tenant_id()` para isolamento multi-tenant
- `get_user_role()` retorna role sem recursão (SECURITY DEFINER)

### 3. Frontend (router.js)
- `canAccess(page)` verifica perfil antes de carregar qualquer view
- Sidebar filtrado por `showNavForPerfil(role)` em auth.js

### 4. Trigger de capacidade
```sql
-- Bloqueia matrícula se turma cheia
IF TG_OP = 'INSERT' THEN
  PERFORM 1 FROM turmas WHERE id = NEW.turma_id AND ocupadas >= vagas;
  IF FOUND THEN RAISE EXCEPTION 'Turma sem vagas disponíveis'; END IF;
```

## Certificados públicos

- Policy pública de certificados **removida** (ver Chain_hlv.sql)
- Verificação pública via Edge Function (a implementar)
- `codigo_verificacao` é UNIQUE e serve como token de verificação

## Links

- [[mod-auth]]
- [[mod-rbac]]
- [[decisao-security-crypto]]
- [[fluxo-autenticacao]]
