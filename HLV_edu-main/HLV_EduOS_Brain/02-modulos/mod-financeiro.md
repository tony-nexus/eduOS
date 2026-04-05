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

## Ao receber pagamento

```js
await supabase.from('pagamentos').update(payload).eq('id', id);
// Se todos os pagamentos da matrícula recebidos:
await supabase.from('matriculas').update({ status: 'concluido' });
```

## Links

- [[mod-matriculas]]
- [[mod-relatorios]]
- [[modelo-registro]]
