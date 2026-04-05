---
tags: [modulo, certificados, validade, emissao]
links: [[MOC]], [[mod-renovacoes]], [[modelo-registro]]
---

# 🎓 mod-certificados — Certificados

**Arquivo:** `js/views/certificados.js`
**Rota:** `certificados`
**Permissões:** secretaria, coordenador

## Status

```
valido → a_vencer (< 60 dias) → vencido
       → cancelado
```

## Recalculo automático no carregamento

```js
// Status recalculado em runtime ao carregar
const hoje = new Date();
const diasRestantes = (new Date(cert.data_validade) - hoje) / 86400000;
status = diasRestantes < 0 ? 'vencido' : diasRestantes < 60 ? 'a_vencer' : 'valido';
await supabase.from('certificados').update({ status });
```

> ⚠️ A view `v_certificados_status` no banco também recalcula, mas o frontend faz a atualização explícita ao abrir o módulo.

## Código de Verificação

- Campo `codigo_verificacao VARCHAR(50) UNIQUE`
- Usado na página pública `certificado.html` para verificação externa

## Links

- [[mod-renovacoes]]
- [[modelo-registro]]
- [[fluxo-autenticacao]]
