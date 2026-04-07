---
tags: [modulo, pipeline, kanban]
links: [[MOC]], [[mod-matriculas]]
---

# 🔄 mod-pipeline — Pipeline Kanban

**Arquivo:** `js/views/pipeline.js`
**Rota:** `pipeline`
**Permissões:** secretaria, comercial, coordenador

## Funcionamento

Kanban com colunas baseadas nos status de `matriculas`:

```
[matriculado] → [em_andamento] → [concluido]
                               → [cancelado]
                               → [trancado]
```

## Drag-and-drop

```js
// Ao soltar card em nova coluna:
await supabase.from('matriculas')
  .update({ status: newStatus })
  .eq('id', matriculaId);
```

## Dados carregados

```js
.select('*, aluno:aluno_id(nome), curso:curso_id(nome)')
```

## Links

- [[mod-matriculas]]
- [[mod-dashboard]]
