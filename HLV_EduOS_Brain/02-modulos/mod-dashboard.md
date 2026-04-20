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
| KPIs | Alunos ativos, matrículas em andamento, certificados ativos, receita, alertas | `alunos`, `matriculas`, `certificados`, `pagamentos` |
| Pipeline | Distribuição de matrículas por status | `matriculas` |
| Alertas | Certificados `a_vencer` e `vencido` | `certificados` |
| Financeiro | Receita recebida vs pendente vs em atraso | `pagamentos` |
| Turmas ativas | Turmas `agendada` e `em_andamento` | `turmas` |
| Últimas matrículas | Feed recente (5 registros) | `matriculas` |
| Certificados | Recentes/próximos com badge de status | `certificados` |

## KPI — Certificados Ativos

Conta apenas certificados com `status IN ('valido', 'a_vencer')`.
Certificados vencidos (`vencido`) são excluídos desta contagem, pois representam pendências, não ativos.

## Badges de Turmas

Padrão consistente com turmas.js:
- `em_andamento` → `badge-amber`
- `agendada` → `badge-blue`

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
> Automações (`runAutomations`) executam em background sem bloquear o render.

## Links

- [[mod-matriculas]]
- [[mod-certificados]]
- [[mod-financeiro]]
- [[mod-turmas]]
