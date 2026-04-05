---
tags: [modulo, utils, helpers]
links: [[MOC]], [[arquitetura-componentes]]
---

# 🛠️ mod-utils — Utilitários

**Arquivos:** `js/ui/components.js`, `js/ui/charts.js`, `js/ui/theme.js`

## Funções principais

### components.js

```js
setContent(html)     // substitui innerHTML de #content
toast(msg, type)     // notificação: 'success' | 'error' | 'warning'
fmtDate(date)        // → "dd/mm/aaaa" (pt-BR)
fmtMoney(value)      // → "R$ 1.234,56"
```

### charts.js

- Wrappers sobre Chart.js para gráficos do dashboard e relatórios

### theme.js

- Toggle dark/light mode via classe CSS no `<html>`

## Links

- [[arquitetura-componentes]]
- [[mod-dashboard]]
