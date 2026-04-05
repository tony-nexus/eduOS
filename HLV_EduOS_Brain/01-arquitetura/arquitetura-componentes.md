---
tags: [arquitetura, componentes, estrutura]
links: [[MOC]], [[visao-geral]]
---

# 🧩 Arquitetura de Componentes

## Estrutura de Arquivos

```
HLV_edu/
├── index.html              ← Shell SPA (sidebar, topbar, #content)
├── certificado.html        ← Página pública de verificação de certificado
│
├── css/
│   ├── globals.css         ← Variáveis CSS, reset, tipografia
│   ├── layout.css          ← Sidebar, topbar, grid principal
│   └── components.css      ← Cards, botões, forms, modais, tabelas
│
├── js/
│   ├── core/
│   │   ├── init.js         ← Bootstrap: verifica sessão, monta UI
│   │   ├── auth.js         ← Login/logout, currentUser, showNavForPerfil()
│   │   ├── router.js       ← Roteamento hash, guard de permissões
│   │   └── supabase.js     ← Cliente Supabase singleton
│   │
│   ├── ui/
│   │   ├── components.js   ← setContent(), toast(), fmtDate(), fmtMoney()
│   │   ├── charts.js       ← Wrappers de Chart.js
│   │   └── theme.js        ← Toggle dark/light mode
│   │
│   └── views/
│       ├── dashboard.js
│       ├── alunos.js
│       ├── turmas.js
│       ├── cursos.js
│       ├── instrutores.js
│       ├── matriculas.js
│       ├── pipeline.js
│       ├── certificados.js
│       ├── empresas.js
│       ├── renovacoes.js
│       ├── financeiro.js
│       ├── relatorios.js
│       ├── rbac.js
│       └── configuracoes.js
│
└── SQL/
    ├── 00_Schema_Completo.sql   ← Schema principal de produção
    ├── 01_Fix_RLS.sql           ← Correções de policies
    ├── Chain_hlv.sql            ← Schema v3.0 produção ready
    ├── Bypass_RLS_Demo.sql      ← Script de demo/bypass
    └── Insert_Demo_Tenant.sql   ← Seed de dados demo
```

---

## Padrão de Módulo (View)

Cada view segue o mesmo contrato:

```js
// js/views/exemplo.js
import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, toast, fmtDate, fmtMoney } from '../ui/components.js';
import { navigate } from '../core/router.js';

export async function render() {
  setContent(`<div>...</div>`);   // 1. Monta HTML
  await loadData();                // 2. Busca dados
  bindEvents();                    // 3. Registra eventos
}
```

---

## Ciclo de Vida da SPA

```
index.html carrega
    ↓
init.js → verifica sessão Supabase
    ↓ sessão válida
auth.js → carrega perfil → showNavForPerfil()
    ↓
router.js → navega para 'dashboard'
    ↓
dashboard.js → render() → Promise.all([KPIs, Pipeline, ...])
    ↓
Usuário clica no menu → navigate('alunos')
    ↓
router.js → canAccess() → alunos.js render()
```

---

## UI Components reutilizáveis

| Função | Uso |
|---|---|
| `setContent(html)` | Substitui `#content` |
| `toast(msg, type)` | Notificação flutuante |
| `fmtDate(date)` | Formata para pt-BR |
| `fmtMoney(val)` | Formata R$ |

---

## Links

- [[visao-geral]]
- [[mod-auth]]
- [[mod-utils]]
- [[api-modulos]]
