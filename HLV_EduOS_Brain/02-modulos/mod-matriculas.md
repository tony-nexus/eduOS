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
matriculado → em_andamento → concluido
                           → cancelado
                           → trancado
```

## Fluxo de Criação

```js
1. Usuário seleciona aluno + curso + turma
2. Sistema valida vagas disponíveis
3. INSERT em matriculas
4. Auto-gera pagamento em pagamentos (valor_negociado)
5. turmas.ocupadas++ via trigger
```

## Joins carregados

```js
.select('*, aluno:aluno_id(nome), curso:curso_id(nome), turma:turma_id(codigo)')
```

## Campos importantes

- `UNIQUE(aluno_id, turma_id)` — impede duplicatas
- `valor_negociado` — pode diferir de `cursos.valor_padrao`

## Links

- [[mod-pipeline]]
- [[mod-financeiro]]
- [[mod-turmas]]
- [[mod-alunos]]
- [[modelo-registro]]
