---
tags: [modulo, pipeline, kanban, master-detail, automacao]
links: [[MOC]], [[mod-matriculas]], [[mod-turmas]]
---

# 🔄 mod-pipeline — Pipeline Operacional

**Arquivo:** `js/views/pipeline.js`
**Rota:** `pipeline`
**Permissões:** secretaria, comercial, coordenador

## Layout: Master-Detail

```
┌──────────────────┬──────────────────────────────────────────┐
│  MASTER (~35%)   │  DETAIL (~65%)                           │
│  Lista de turmas │  Kanban da turma selecionada             │
└──────────────────┴──────────────────────────────────────────┘
```

- **CSS:** `.pipe-layout`, `.pipe-master-panel`, `.pipe-detail-panel`
- **Reutiliza:** `.inst-item`, `.inst-item.active`, `.inst-detail-empty`, `.inst-back-btn`
- **Mobile:** detalhe oculto por `.mob-hide`, botão `.inst-back-btn` ativa retorno
- **State:** `_turmas`, `_matriculas` (da turma ativa), `_activeId`, `_refreshTimer`

## Auto-refresh (frontend)

```js
const REFRESH_INTERVAL_MS = 30_000; // 30 segundos
```

A cada 30s o pipeline:
1. Recarrega matrículas da turma ativa (silenciosamente, sem skeleton)
2. Atualiza `status`, `vagas`, `ocupadas` das turmas no master
3. Exibe `"Atualizado às HH:MM:SS"` no header com indicador verde pulsante

Timer gerenciado por `startRefresh()` / `stopRefresh()` — limpo ao navegar para outra página.

## Automação no banco (M14)

O pipeline é alimentado autonomamente pelo banco de dados via:

| Mecanismo | O que faz |
|---|---|
| `trg_turma_status_change` | Quando turma muda status → propaga para matrículas |
| `trg_turma_insert_enroll` | Nova turma criada → enrola alunos `aguardando_turma` |
| `hlv-sync-turmas` (cron 00:05 UTC) | Avança turmas por `data_inicio`/`data_fim` |
| `hlv-emit-certs` (cron 00:30 UTC) | Emite certificados para concluídos sem pendências |

## Queries Supabase

### Lista de turmas (master)
```js
supabase.from('turmas')
  .select('id, codigo, status, vagas, ocupadas, data_inicio, data_fim, curso:curso_id(nome)')
  .eq('tenant_id', getTenantId())
  .order('data_inicio', { ascending: false })
```

### Matrículas da turma (kanban)
```js
supabase.from('matriculas')
  .select('id, status, aluno:aluno_id(nome), curso:curso_id(nome)')
  .eq('tenant_id', getTenantId())
  .eq('turma_id', turmaId)
```

## Colunas Kanban

| Coluna | Status | Cor |
|---|---|---|
| Matriculados | `matriculado` | `--blue` |
| Ag. Turma | `aguardando_turma` | `--amber` |
| Em Andamento | `em_andamento` | `--accent` |
| Reprovados | `reprovado` | `--red` |
| Concluído | `concluido` | `--green` |
| Cert. Emitido | `certificado_emitido` | `--purple` |

## Transições válidas (drag-and-drop)

```js
const TRANSICOES = {
  matriculado:         ['aguardando_turma', 'em_andamento', 'cancelado'],
  aguardando_turma:    ['matriculado', 'em_andamento', 'cancelado'],
  em_andamento:        ['concluido', 'reprovado', 'cancelado'],
  reprovado:           ['aguardando_turma'],
  concluido:           ['certificado_emitido'],
  certificado_emitido: [],
};
```

## Validações no drop

- Transição inválida → toast `warning`, ação cancelada
- Mover para estado ativo com turma sem vagas → toast `warning`, ação cancelada
- Otimismo: re-render imediato, revert se Supabase retornar erro

## Links

- [[mod-matriculas]]
- [[mod-turmas]]
- [[mod-dashboard]]
