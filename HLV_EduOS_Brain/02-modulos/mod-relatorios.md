---
tags: [modulo, relatorios, analytics]
links: [[MOC]], [[mod-financeiro]], [[mod-matriculas]]
---

# 📈 mod-relatorios — Relatórios

**Arquivo:** `js/views/relatorios.js`
**Rota:** `relatorios`
**Permissões:** financeiro, coordenador

## Consultas realizadas em paralelo

```js
Promise.all([
  supabase.from('pagamentos').select('valor, status, data_pagamento, data_vencimento'),
  supabase.from('matriculas').select('status, created_at'),
  supabase.from('turmas').select('vagas, ocupadas, data_inicio'),
  supabase.from('certificados').select('status, data_emissao'),
])
```

## Relatórios disponíveis

- Receita por período (recebido vs pendente vs atraso)
- Matrículas por mês
- Taxa de ocupação de turmas
- Certificados emitidos / vencidos

## Links

- [[mod-financeiro]]
- [[mod-matriculas]]
- [[mod-turmas]]
