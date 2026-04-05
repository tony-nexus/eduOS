---
tags: [decisao, seguranca, rls, supabase, crypto]
links: [[MOC]], [[mod-security]], [[fluxo-autenticacao]]
---

# ⚖️ Decisão: Estratégia de Segurança

## Decisões tomadas

### 1. RLS como primeira linha de defesa
- Toda query é filtrada por `tenant_id` via RLS
- Frontend nunca filtra por tenant manualmente — o banco garante

### 2. JWT como veículo do tenant_id
- Auth Hook injeta `tenant_id` em `app_metadata` do JWT
- Evita query adicional em cada request para descobrir o tenant

### 3. SECURITY DEFINER nas funções críticas
- `get_user_role()` usa SECURITY DEFINER para evitar recursão no RLS

### 4. Verificação pública de certificados via Edge Function
- Policy pública removida da tabela `certificados`
- Edge Function valida `codigo_verificacao` sem expor dados

### 5. Bypass desabilitado em produção
- `Bypass_RLS_Demo.sql` é apenas para testes locais

## Links

- [[mod-security]]
- [[mod-rbac]]
- [[fluxo-autenticacao]]
