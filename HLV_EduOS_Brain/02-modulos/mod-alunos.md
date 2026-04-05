---
tags: [modulo, alunos, crud]
links: [[MOC]], [[mod-matriculas]], [[modelo-registro]]
---

# 👥 mod-alunos — Gestão de Alunos

**Arquivo:** `js/views/alunos.js`
**Rota:** `alunos`
**Permissões:** secretaria, coordenador, comercial

## Campos da tabela `alunos`

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | Multi-tenant |
| user_id | UUID FK | auth.users (portal aluno futuro) |
| nome | VARCHAR | |
| cpf | VARCHAR | UNIQUE por tenant |
| email | VARCHAR | |
| telefone | VARCHAR | |
| data_nascimento | DATE | |
| tipo_pessoa | VARCHAR | `pessoa_fisica` \| `empresa` |
| empresa_id | UUID FK | Vínculo B2B |
| status | VARCHAR | `ativo` \| `inativo` |
| cep, rua, numero, complemento, bairro, cidade, uf | endereço | |

## Operações

- **Listar** com join em `empresa:empresa_id(id, nome)`
- **Criar** / **Editar** via modal
- **Ativar/Inativar** toggle de status
- **KPIs** por status

## Links

- [[mod-empresas]]
- [[mod-matriculas]]
- [[modelo-registro]]
