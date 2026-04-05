---
tags: [banco-de-dados, schema, sql, importacao]
links: [[MOC]], [[modelo-registro]]
---

# 📋 Schema SQL — Referência

## Arquivos

| Arquivo | Descrição |
|---|---|
| `SQL/Chain_hlv.sql` | Schema v3.0 — **produção** |
| `SQL/00_Schema_Completo.sql` | Schema completo com comentários |
| `SQL/00_Schema_Completo_utf8.sql` | Idem com encoding UTF-8 |
| `SQL/01_Fix_RLS.sql` | Correções pontuais de policies RLS |
| `SQL/Bypass_RLS_Demo.sql` | Bypass RLS para testes (NÃO usar em produção) |
| `SQL/Insert_Demo_Tenant.sql` | Seed de dados de demonstração |

## Versão de produção: Chain_hlv.sql v3.0

Melhorias desta versão:
1. `UNIQUE(aluno_id, turma_id)` em matriculas
2. Guard de capacidade no trigger (bloqueia INSERT quando turma cheia)
3. View `v_certificados_status`
4. Índices em `certificados(status)` e `pagamentos(data_vencimento)`
5. Policy pública de certificados removida

## Links

- [[modelo-registro]]
- [[mod-security]]
- [[fluxo-importacao-dados]]
