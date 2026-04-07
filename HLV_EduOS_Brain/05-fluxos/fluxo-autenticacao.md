---
tags: [fluxo, auth, jwt, supabase]
links: [[MOC]], [[mod-auth]], [[mod-security]]
---

# 🔄 Fluxo de Autenticação

## Sequência completa

```
1. Usuário abre index.html
      ↓
2. init.js → initAuth() → supabase.auth.getSession()
      ↓ sem sessão              ↓ sessão ativa
3. Exibe login normal     _setupSessionUI():
                           - pré-preenche email
                           - esconde campo senha
                           - botão: "Continuar como [nome]"
                           - hint: "Sessão ativa · email"
      ↓ (sempre exibe tela de login — nunca auto-redireciona)
4. Usuário clica em Entrar / Continuar
      ↓
5. doLogin(email, password)
      ↓ sessão ativa e email bate   ↓ sem sessão ou email diferente
      usa _cachedSession.user.id    signInWithPassword({ email, password })
      (sem re-autenticação)
      ↓
6. Busca perfil:
   FROM perfis WHERE user_id = userId
      ↓
7. Monta currentUser { id, email, name, role, tenant_id, initials }
      ↓
8. globalThis.__eduos_auth = { currentUser }
      ↓
9. showApp() → exibe sidebar e topbar
   showNavForPerfil(role) → filtra itens do menu
      ↓
10. navigate('dashboard') + showLoadingScreen()
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
