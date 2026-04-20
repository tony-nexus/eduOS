---
tags: [banco-de-dados, schema, er, tabelas]
links: [[MOC]], [[schema-xlsx-import]]
---

# 🗄️ Modelo de Registro — Diagrama ER

## Tabelas e Relacionamentos

```
auth.users (Supabase Auth)
    │
    ├─◄ perfis (user_id, tenant_id, nome, role)
    │       └── role: super_admin | admin | coordenador | secretaria
    │                  financeiro | comercial | instrutor | aluno
    │
    └─◄ instrutores (user_id)

tenants (id, nome, cnpj, logo_url, cor_primaria)
    │
    ├─◄ perfis
    ├─◄ empresas
    ├─◄ cursos
    ├─◄ instrutores
    ├─◄ alunos
    ├─◄ turmas
    ├─◄ matriculas
    ├─◄ pagamentos
    └─◄ certificados

empresas (id, tenant_id, nome, cnpj, status)
    └─◄ alunos (empresa_id)

cursos (id, tenant_id, codigo UNIQUE, nome, carga_horaria, valor_padrao, validade_meses, ativo)
    ├─◄ turmas (curso_id)
    ├─◄ matriculas (curso_id)
    ├─◄ pagamentos (curso_id)
    └─◄ certificados (curso_id)

instrutores (id, tenant_id, user_id, nome, cpf, email, telefone, avaliacao, ativo)
    └─◄ turmas (instrutor_id)

alunos (id, tenant_id, user_id, nome, cpf UNIQUE/tenant, email, tipo_pessoa, empresa_id, status)
    ├─◄ matriculas (aluno_id)
    ├─◄ pagamentos (aluno_id)
    └─◄ certificados (aluno_id)

turmas (id, tenant_id, codigo UNIQUE/tenant, curso_id, instrutor_id, vagas, ocupadas, status, data_inicio, data_fim, local)
    │   status: agendada | em_andamento | concluida | cancelada
    ├─◄ matriculas (turma_id)
    └─◄ certificados (turma_id)

matriculas (id, tenant_id, aluno_id, turma_id, curso_id, status, data_matricula, valor_negociado, obs)
    │   status: matriculado | em_andamento | concluido | cancelado | trancado
    │   UNIQUE(aluno_id, turma_id)
    ├─◄ pagamentos (matricula_id)
    └─◄ certificados (matricula_id)

pagamentos (id, tenant_id, matricula_id, aluno_id, curso_id, valor, status, tipo_pagamento, data_vencimento, data_pagamento)
    │   status: pendente | recebido | atraso | cancelado
    │   tipo: dinheiro | cartao_credito | cartao_debito | pix | boleto | transferencia | cheque

certificados (id, tenant_id, aluno_id, curso_id, turma_id, matricula_id, codigo_verificacao UNIQUE, data_emissao, data_validade, status, observacoes)
    │   status: valido | a_vencer | vencido | cancelado
```

---

## Triggers

| Trigger | Tabela | Ação |
|---|---|---|
| `atualizar_ocupadas` | `matriculas` | Incrementa/decrementa `turmas.ocupadas` em INSERT/DELETE/UPDATE |
| `fn_sync_turma_ocupadas` | `turmas` | Sincroniza contador de vagas |
| `fn_mark_pagamentos_atrasados` | `pagamentos` | Marca como `atraso` pagamentos vencidos |

---

## Views SQL

| View | Descrição |
|---|---|
| `v_certificados_status` | Recalcula status de certificados em tempo real com base em `data_validade` |

---

## Funções SQL

| Função | Descrição |
|---|---|
| `get_tenant_id()` | Lê `tenant_id` do JWT |
| `get_user_role()` | Retorna role do usuário logado sem recursão RLS |
| `autorizar_matricula(aluno_id, curso_id)` | Valida se aluno pode ser matriculado |
| `atualizar_ocupadas()` | Trigger de controle de vagas |

---

## Links

- [[schema-xlsx-import]]
- [[mod-matriculas]]
- [[mod-turmas]]
- [[mod-certificados]]
- [[fluxo-autenticacao]]
