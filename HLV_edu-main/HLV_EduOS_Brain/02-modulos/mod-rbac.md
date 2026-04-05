---
tags: [modulo, rbac, permissoes, seguranca]
links: [[MOC]], [[mod-auth]], [[decisao-security-crypto]]
---

# 🔒 mod-rbac — Permissões RBAC

**Arquivo:** `js/views/rbac.js`
**Rota:** `rbac`
**Permissões:** apenas `admin` e `super_admin`

## Matriz de Permissões (router.js)

| Rota | Perfis permitidos |
|---|---|
| dashboard | secretaria, coordenador, financeiro, comercial, instrutor |
| alunos | secretaria, coordenador, comercial |
| turmas | secretaria, coordenador, instrutor |
| cursos | secretaria, coordenador |
| instrutores | secretaria, coordenador |
| matriculas | secretaria, comercial |
| pipeline | secretaria, comercial, coordenador |
| certificados | secretaria, coordenador |
| empresas | secretaria, comercial, financeiro |
| renovacoes | secretaria, comercial, coordenador |
| financeiro | financeiro |
| relatorios | financeiro, coordenador |
| rbac | _(só admin/super_admin)_ |
| configuracoes | _(só admin/super_admin)_ |

> `admin` e `super_admin` sempre têm acesso irrestrito (via `canAccess()`)

## RLS no banco

Cada tabela tem policies que usam `get_tenant_id()` e `get_user_role()` para isolar dados por tenant e restringir por perfil.

## Links

- [[mod-auth]]
- [[visao-geral]]
- [[decisao-security-crypto]]
