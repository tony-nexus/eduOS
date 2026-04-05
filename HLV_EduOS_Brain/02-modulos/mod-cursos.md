---
tags: [modulo, cursos, crud]
links: [[MOC]], [[mod-turmas]], [[modelo-registro]]
---

# 📚 mod-cursos — Gestão de Cursos

**Arquivo:** `js/views/cursos.js`
**Rota:** `cursos`
**Permissões:** secretaria, coordenador

## Campos da tabela `cursos`

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | |
| codigo | VARCHAR | UNIQUE por tenant |
| nome | VARCHAR | |
| carga_horaria | INTEGER | horas |
| valor_padrao | DECIMAL | Base para matrículas |
| validade_meses | INTEGER | Validade do certificado |
| ativo | BOOLEAN | |

## Relações

- `turmas` usa `curso_id`
- `certificados.validade_meses` vem de `cursos.validade_meses`
- `matriculas.valor_negociado` parte de `cursos.valor_padrao`

## Links

- [[mod-turmas]]
- [[mod-matriculas]]
- [[mod-certificados]]
