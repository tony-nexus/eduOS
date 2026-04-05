---
tags: [modulo, renovacoes, alertas, certificados]
links: [[MOC]], [[mod-certificados]]
---

# 🔔 mod-renovacoes — Alertas de Renovação

**Arquivo:** `js/views/renovacoes.js`
**Rota:** `renovacoes`
**Permissões:** secretaria, comercial, coordenador

## Funcionamento

Feed **somente leitura** de certificados com status `a_vencer` ou `vencido`.

```js
.select('*, aluno:aluno_id(nome, empresa:empresa_id(nome)), curso:curso_id(nome)')
.in('status', ['a_vencer', 'vencido'])
```

## Estratégia comercial

- Mostra alunos com certificados próximos ao vencimento
- Permite equipe comercial acionar renovação proativamente
- Exibe empresa vinculada (B2B)

## Links

- [[mod-certificados]]
- [[mod-empresas]]
