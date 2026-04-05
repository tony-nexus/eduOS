---
tags: [fluxo, importacao, xlsx]
links: [[MOC]], [[schema-xlsx-import]]
---

# 🔄 Fluxo de Importação de Dados

## Descrição

Importação em lote via XLSX para popular o banco inicial (alunos, cursos, turmas).

## Arquivo de referência

`SQL/00_Schema_Completo.sql` e `SQL/00_Schema_Completo_utf8.sql` — versão com encoding UTF-8 para importação.

## Passo a passo

1. Preparar planilha conforme schema
2. Converter para CSV ou executar SQL seed
3. `Insert_Demo_Tenant.sql` para dados de demonstração
4. Validar RLS com o tenant correto

## Links

- [[schema-xlsx-import]]
- [[modelo-registro]]
