---
tags: [decisao, ui, tabelas, bibliotecas]
links: [[MOC]], [[arquitetura-componentes]]
---

# ⚖️ Decisão: Tabelas de Dados

## Contexto

Escolha de lib/abordagem para tabelas com ordenação, busca e paginação.

## Decisão atual

**HTML nativo + renderização manual** (sem lib externa tipo DataTables ou Tabulator)

## Avaliação futura

Considerar **Tabulator.js** se houver necessidade de:
- Paginação server-side
- Exportação para Excel/PDF integrada
- Edição inline de células

## Links

- [[arquitetura-componentes]]
- [[mod-alunos]]
- [[mod-turmas]]
