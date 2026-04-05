---
tags: [decisao, arquitetura, vanilla-js]
links: [[MOC]], [[arquitetura-componentes]]
---

# ⚖️ Decisão: Stack Vanilla JS

## Contexto

Escolha de não usar React/Vue/Angular para o frontend do HLV EduOS.

## Decisão

**Vanilla JS (ES Modules) + HTML/CSS**

## Justificativas

- Zero dependências de build (sem webpack, vite, npm obrigatório)
- Deploy direto via GitHub Pages ou qualquer CDN
- Controle total sobre o ciclo de renderização
- Performance superior para SPAs de médio porte
- Facilidade de manutenção por equipe pequena

## Trade-offs aceitos

- Sem reatividade automática (state management manual)
- Sem componentes declarativos (templates via template literals)
- Mais código boilerplate em formulários

## Padrão adotado

```js
export async function render() {
  setContent(`<div>...</div>`);
  await loadData();
  bindEvents();
}
```

## Links

- [[arquitetura-componentes]]
- [[visao-geral]]
