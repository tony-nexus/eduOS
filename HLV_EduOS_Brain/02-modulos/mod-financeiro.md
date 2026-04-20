---
tags: [modulo, financeiro, pagamentos]
links: [[MOC]], [[mod-matriculas]], [[modelo-registro]]
---

# 💰 mod-financeiro — Financeiro

**Arquivo:** `js/views/financeiro.js`
**Rota:** `financeiro`
**Permissões:** financeiro

## Tabela `pagamentos`

| Campo | Tipo | Valores |
|---|---|---|
| status | VARCHAR | `pendente` \| `recebido` \| `atraso` \| `cancelado` |
| tipo_pagamento | VARCHAR | `dinheiro` \| `cartao_credito` \| `cartao_debito` \| `pix` \| `boleto` \| `transferencia` \| `cheque` |
| data_vencimento | DATE | |
| data_pagamento | DATE | Preenchido ao receber |

## Lógica de atraso

```js
// Ao carregar o módulo:
// pagamentos pendentes com data_vencimento < hoje → status = 'atraso'
await supabase.from('pagamentos')
  .update({ status: 'atraso' })
  .eq('status', 'pendente')
  .lt('data_vencimento', hoje);
```

## Abas (3 tabs)

| Aba | Conteúdo |
|---|---|
| Cobranças | Tabela com filtros (status, tipo, curso, intervalo de vencimento) |
| Resumo Mensal | Gráfico de barras CSS (últimos 6 meses: recebido/pendente/atraso) + breakdown por forma de pagamento |
| Inadimplência | Aging report em buckets: 1–30, 31–60, 61–90, +90 dias + barra de distribuição |

## Ao receber pagamento

```js
await supabase.from('pagamentos').update({ status:'recebido', data_pagamento, tipo_pagamento }).eq('id', id);
// Nota: NÃO avança matrícula — o pipeline de status é responsabilidade das automações (M14/M16)
```

## Links

- [[mod-matriculas]]
- [[mod-relatorios]]
- [[modelo-registro]]
