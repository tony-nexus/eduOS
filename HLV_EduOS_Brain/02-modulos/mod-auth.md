---
tags: [modulo, auth, seguranca, rbac]
links: [[MOC]], [[visao-geral]], [[fluxo-autenticacao]]
---

# 🔐 mod-auth — Autenticação & Sessão

**Arquivo:** `js/core/auth.js`

## Responsabilidades

- Login/logout via Supabase Auth (`signInWithPassword`)
- Carrega perfil da tabela `perfis` após autenticação
- Expõe `currentUser` globalmente via `globalThis.__eduos_auth`
- Controla visibilidade do sidebar por perfil (`showNavForPerfil()`)

## Estrutura do currentUser

```js
currentUser = {
  id:        UUID,          // auth.users.id
  email:     string,
  name:      string,        // perfis.nome
  role:      string,        // perfis.role
  initials:  string,        // 2 letras geradas do nome
  perfil:    string,        // alias de role
  tenant_id: UUID,          // perfis.tenant_id
}
```

## Fluxo de Login

```
doLogin(email, password)
  ↓ signInWithPassword
  ↓ busca perfis WHERE user_id = auth.uid()
  ↓ monta currentUser
  ↓ _syncGlobal() → globalThis.__eduos_auth
  ↓ showApp() → exibe sidebar
  ↓ navigate('dashboard')
```

## Links

- [[fluxo-autenticacao]]
- [[mod-rbac]]
- [[arquitetura-componentes]]
- [[decisao-security-crypto]]
