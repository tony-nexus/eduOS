---
tags: [modulo, turmas, crud, vagas]
links: [[MOC]], [[mod-cursos]], [[mod-instrutores]], [[mod-matriculas]]
---

# 📅 mod-turmas — Gestão de Turmas

**Arquivo:** `js/views/turmas.js`
**Rota:** `turmas`
**Permissões:** secretaria, coordenador, instrutor

## Campos da tabela `turmas`

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | |
| codigo | VARCHAR | UNIQUE por tenant |
| curso_id | UUID FK | |
| instrutor_id | UUID FK | ON DELETE SET NULL |
| vagas | INTEGER | > 0 |
| ocupadas | INTEGER | Gerenciado por trigger |
| status | VARCHAR | `agendada` \| `em_andamento` \| `concluida` \| `cancelada` |
| data_inicio | DATE | |
| data_fim | DATE | |
| local | VARCHAR | |

## Controle de Vagas

O trigger `atualizar_ocupadas()` controla `ocupadas` automaticamente:
- **INSERT matrícula** → `ocupadas + 1` (bloqueia se `ocupadas >= vagas`)
- **DELETE matrícula** → `ocupadas - 1`
- **UPDATE turma** → recalcula

## Joins carregados

```js
.select('*, curso:curso_id(id, nome, codigo), instrutor:instrutor_id(nome)')
```

## Links

- [[mod-cursos]]
- [[mod-instrutores]]
- [[mod-matriculas]]
- [[modelo-registro]]
- [[debitos-tecnicos]]
