---
tags: [modulo, instrutores, crud, master-detail]
links: [[MOC]], [[mod-turmas]], [[mod-matriculas]]
---

# 👨‍🏫 mod-instrutores — Gestão de Instrutores

**Arquivo:** `js/views/instrutores.js`
**Rota:** `instrutores`
**Permissões:** secretaria, coordenador

## Layout: Master-Detail

```
┌─────────────────┬──────────────────────────────────────┐
│  MASTER (~35%)  │  DETAIL (~65%)                       │
│  Lista de       │  Turmas do instrutor selecionado     │
│  instrutores    │  + Modal de alunos por turma         │
└─────────────────┴──────────────────────────────────────┘
```

- **CSS:** `.inst-layout`, `.inst-master-panel`, `.inst-detail-panel`
- **Mobile:** detalhe oculto por `.mob-hide`, botão `.inst-back-btn` ativa retorno
- **State:** `_cache` (instrutores), `_activeId` (instrutor selecionado)

## Queries Supabase

### Turmas do instrutor (detalhe)
```js
supabase.from('turmas')
  .select('id, codigo, status, ocupadas, vagas, data_inicio, data_fim, curso:curso_id(nome)')
  .eq('tenant_id', getTenantId())
  .eq('instrutor_id', instrutorId)
  .order('data_inicio', { ascending: false })
```

### Alunos de uma turma (modal)
```js
supabase.from('matriculas')
  .select('id, status, aluno:aluno_id(nome, cpf, rnm)')
  .eq('tenant_id', getTenantId())
  .eq('turma_id', turmaId)
  .neq('status', 'cancelado')
```

## KPIs exibidos no detalhe

| Métrica | Descrição |
|---|---|
| Turmas | Total de turmas vinculadas ao instrutor |
| Ativas | Turmas com status `agendada` ou `em_andamento` |
| Alunos | Soma de `ocupadas` de todas as turmas |

## Campos da tabela `instrutores`

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID PK | |
| tenant_id | UUID FK | |
| user_id | UUID FK | auth.users (portal futuro) |
| nome | VARCHAR | |
| cpf | VARCHAR | |
| email | VARCHAR | |
| telefone | VARCHAR | |
| especialidades | TEXT / ARRAY | Badges exibidos no detalhe |
| avaliacao | DECIMAL(2,1) | 1.0 a 5.0, default 5.0 |
| ativo | BOOLEAN | |

## Links

- [[mod-turmas]]
- [[mod-matriculas]]
