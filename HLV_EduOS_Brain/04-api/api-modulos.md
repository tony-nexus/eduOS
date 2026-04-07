---
tags: [api, supabase, referencia]
links: [[MOC]], [[modelo-registro]]
---

# 🔌 API — Referência de Chamadas Supabase

## Padrão geral

```js
import { supabase, getTenantId } from '../core/supabase.js';

const { data, error } = await supabase
  .from('tabela')
  .select('campos')
  .eq('tenant_id', getTenantId());
```

## Por módulo

### alunos
```js
.select('id, nome, cpf, email, telefone, data_nascimento, tipo_pessoa, status, ..., empresa:empresa_id(id, nome)')
.eq('tenant_id', getTenantId())
```

### turmas
```js
.select('*, curso:curso_id(id, nome, codigo), instrutor:instrutor_id(nome)')
.eq('tenant_id', getTenantId())
```

### matriculas
```js
.select('*, aluno:aluno_id(nome), curso:curso_id(nome), turma:turma_id(codigo)')
.eq('tenant_id', getTenantId())
```

### certificados
```js
.select('*, aluno:aluno_id(nome), curso:curso_id(nome)')
.eq('tenant_id', getTenantId())
```

### pagamentos (financeiro)
```js
.select('*, aluno:aluno_id(nome), curso:curso_id(nome)')
.eq('tenant_id', getTenantId())
```

### renovacoes
```js
.select('*, aluno:aluno_id(nome, empresa:empresa_id(nome)), curso:curso_id(nome)')
.in('status', ['a_vencer', 'vencido'])
```

## Contagens com `head: true`

```js
supabase.from('alunos')
  .select('*', { count: 'exact', head: true })
  .eq('tenant_id', tenant)
  .eq('status', 'ativo')
// → retorna { count: N } sem dados
```

## Links

- [[modelo-registro]]
- [[arquitetura-componentes]]
