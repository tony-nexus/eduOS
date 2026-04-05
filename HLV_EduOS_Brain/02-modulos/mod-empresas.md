---
tags: [modulo, empresas, b2b]
links: [[MOC]], [[mod-alunos]]
---

# 🏢 mod-empresas — Empresas B2B

**Arquivo:** `js/views/empresas.js`
**Rota:** `empresas`
**Permissões:** secretaria, comercial, financeiro

## Campos da tabela `empresas`

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | |
| nome | VARCHAR | |
| cnpj | VARCHAR(20) | UNIQUE global |
| status | VARCHAR | `ativo` \| `inativo` |

## Relacionamento

```
empresas (1) ──── (N) alunos
```

Alunos com `tipo_pessoa = 'empresa'` são vinculados a uma empresa.

## Links

- [[mod-alunos]]
- [[mod-renovacoes]]
