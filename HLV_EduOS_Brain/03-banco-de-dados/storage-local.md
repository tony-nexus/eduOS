---
tags: [banco-de-dados, storage, local]
links: [[MOC]]
---

# 💾 Storage Local

## Uso atual

O projeto **não usa** localStorage/sessionStorage para dados de negócio.

Toda persistência é via Supabase (PostgreSQL).

## Estado em memória

- `currentUser` — mantido em `auth.js` e `globalThis.__eduos_auth`
- Dados de views — recarregados a cada `render()`

## Theme

- `theme.js` pode usar localStorage para persistir preferência dark/light mode

## Links

- [[arquitetura-componentes]]
- [[mod-auth]]
