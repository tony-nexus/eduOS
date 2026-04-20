---
tags: [modulo, matriculas, crud, pagamentos]
links: [[MOC]], [[mod-financeiro]], [[mod-pipeline]], [[mod-turmas]]
---

# 📝 mod-matriculas — Gestão de Matrículas

**Arquivo:** `js/views/matriculas.js`
**Rota:** `matriculas`
**Permissões:** secretaria, comercial

## Status de Matrícula

```
matriculado → em_andamento → concluido → certificado_emitido
           ↘ aguardando_turma
                          → cancelado
                          → reprovado
```

## Ações disponíveis

| Ação | Descrição |
|---|---|
| Nova Matrícula | Cria via modal com aluno + curso + turma |
| Editar Status | Altera status via select modal |
| Excluir | Remove permanentemente com confirmação |

> A exclusão usa `DELETE` no Supabase. O trigger `fn_sync_turma_ocupadas` ajusta `turmas.ocupadas` automaticamente.

## Regras de negócio (guards em cascata)

```
1. Turma deve ter status='agendada'  (em_andamento/concluida bloqueadas)
2. Turma deve ter vaga disponível    (ocupadas < vagas)
3. Aluno não pode estar duplicado na mesma turma
4. Sem conflito de datas com turmas ativas do aluno
   └→ busca matriculas['em_andamento','matriculado'] do aluno, checa sobreposição
5. RPC autorizar_matricula (servidor): valida matrícula ativa + cert válido
```

## Fluxo de Criação

```js
1. Usuário busca aluno(s) por nome/CPF/CNH/RNM (multi-seleção)
2. Seleciona curso + turma (apenas agendadas)
3. Guards: duplicata, turma em_andamento, conflito de datas
4. RPC autorizar_matricula valida regras de negócio no servidor
5. INSERT em matriculas (status auto: 'matriculado' | 'aguardando_turma')
6. turmas.ocupadas++ via trigger fn_sync_turma_ocupadas
```

## Joins carregados

```js
.select('*, aluno:aluno_id(nome), curso:curso_id(nome), turma:turma_id(codigo)')
```

## Campos importantes

- `UNIQUE(aluno_id, turma_id)` — impede duplicatas (guard client-side + constraint no banco)
- `observacoes` — campo livre, auto-preenchido com tipo de matrícula quando classificado pela RPC

## KPIs na tela

| KPI | Lógica |
|---|---|
| Total | Todas as matrículas |
| Em Andamento | `status = 'em_andamento'` |
| Concluídas | `status IN ('concluido', 'certificado_emitido')` |
| Ag. Turma | `status = 'aguardando_turma'` |

## Links

- [[mod-pipeline]]
- [[mod-financeiro]]
- [[mod-turmas]]
- [[mod-alunos]]
- [[modelo-registro]]
