---
tags: [modulo, dashboard, kpi]
links: [[MOC]], [[mod-financeiro]], [[mod-matriculas]]
---

# 📊 mod-dashboard — Visão Geral

**Arquivo:** `js/views/dashboard.js`
**Rota:** `dashboard`
**Permissões:** todos os perfis

## Seções

| Card | Dados | Tabela |
|---|---|---|
| KPIs | Alunos ativos, matrículas em andamento, certificados, receita | `alunos`, `matriculas`, `certificados`, `pagamentos` |
| Pipeline | Distribuição de matrículas por status | `matriculas` |
| Alertas | Certificados a vencer / vencidos | `certificados` |
| Financeiro | Receita recebida vs pendente | `pagamentos` |
| Turmas ativas | Turmas em andamento | `turmas` |
| Últimas matrículas | Feed recente | `matriculas` |
| Certificados a vencer | Próximos 60 dias | `certificados` |

## Padrão de Carregamento

```js
await Promise.all([
  renderKPIs(),
  renderPipeline(),
  renderAlerts(),
  renderFinanceiro(),
  renderTurmas(),
  renderMatriculas(),
  renderCerts(),
]);
```

> Todas as seções carregam em paralelo com skeletons de loading.

## Links

- [[mod-matriculas]]
- [[mod-certificados]]
- [[mod-financeiro]]
- [[mod-turmas]]
