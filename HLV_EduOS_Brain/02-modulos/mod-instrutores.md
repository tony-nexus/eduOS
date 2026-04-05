---
tags: [modulo, instrutores, crud]
links: [[MOC]], [[mod-turmas]]
---

# 👨‍🏫 mod-instrutores — Gestão de Instrutores

**Arquivo:** `js/views/instrutores.js`
**Rota:** `instrutores`
**Permissões:** secretaria, coordenador

## Campos da tabela `instrutores`

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | |
| user_id | UUID FK | auth.users (portal futuro) |
| nome | VARCHAR | |
| cpf | VARCHAR | |
| email | VARCHAR | |
| telefone | VARCHAR | |
| avaliacao | DECIMAL(2,1) | 1.0 a 5.0, default 5.0 |
| ativo | BOOLEAN | |

## Links

- [[mod-turmas]]
