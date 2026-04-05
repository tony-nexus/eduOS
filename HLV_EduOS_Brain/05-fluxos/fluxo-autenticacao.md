---
tags: [fluxo, auth, jwt, supabase]
links: [[MOC]], [[mod-auth]], [[mod-security]]
---

# 🔄 Fluxo de Autenticação

## Sequência completa

```
1. Usuário abre index.html
      ↓
2. init.js → supabase.auth.getSession()
      ↓ sem sessão
3. Exibe tela de login
      ↓ submit
4. auth.js → doLogin(email, password)
      ↓
5. supabase.auth.signInWithPassword({ email, password })
      ↓ sucesso → JWT retornado
6. Auth Hook Supabase injeta tenant_id em app_metadata do JWT
      ↓
7. Busca perfil:
   FROM perfis WHERE user_id = auth.uid()
      ↓
8. Monta currentUser { id, email, name, role, tenant_id, initials }
      ↓
9. globalThis.__eduos_auth = { currentUser }
      ↓
10. showApp() → exibe sidebar e topbar
    showNavForPerfil(role) → filtra itens do menu
      ↓
11. navigate('dashboard')
```

## Auth Hook (Supabase)

O tenant_id deve ser injetado no JWT via Auth Hook configurado no projeto Supabase:

```js
// Edge Function: auth-hook
const { data: perfil } = await supabase
  .from('perfis')
  .select('tenant_id')
  .eq('user_id', user.id)
  .single();

return { app_metadata: { tenant_id: perfil.tenant_id } };
```

## Leitura no RLS

```sql
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
$$ LANGUAGE sql STABLE;
```

## Links

- [[mod-auth]]
- [[mod-security]]
- [[mod-rbac]]
- [[visao-geral]]
