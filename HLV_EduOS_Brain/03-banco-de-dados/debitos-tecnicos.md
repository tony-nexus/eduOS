---
tags: [banco-de-dados, debitos, todos]
links: [[MOC]], [[backlog-features]]
---

# ⚠️ Débitos Técnicos

## Banco de Dados

- [x] Edge Function `verificar-certificado` — endpoint público GET ?codigo= (M17 + supabase/functions/)
- [x] `fn_mark_pagamentos_atrasados` — agendada via cron hlv-pagamentos-atraso 00:10 UTC (M16)
- [ ] `autorizar_matricula(aluno_id, curso_id)` — verificar uso no frontend
- [x] Índice em `alunos(email)` para busca rápida (idx_alunos_email — PRODUCAO.sql)

## Frontend

- [x] `instrutores.js` — mock data substituído por queries Supabase reais
- [x] `pipeline.js` — refatorado para layout Master-Detail por turma
- [x] `matriculas.js` — adicionada opção de excluir matrícula (DELETE com confirmação)
- [x] `dashboard.js` — KPI certificados corrigido (só conta válido+a_vencer), badge em_andamento uniformizado
- [x] `automations.js` + `matriculas.js` — bloqueio de matrícula em turmas `em_andamento` (loadAux, criarMatriculaAutomatica, saveMatricula)
- [x] M16 — pipeline máxima autonomia: vaga liberada → fila, pagamento automático, cert aging, renovação automática
- [x] `autorizar_matricula` RPC v2 (M15) — bloqueia turmas `em_andamento` e conflito de datas server-side
- [ ] `mod-planning-engine` — não implementado
- [ ] `mod-sla-calculator` — não implementado
- [x] Portal do aluno — rota `portal-aluno`, redirect automático no login, matrículas/certs/pagamentos
- [ ] Portal do instrutor (login via `instrutores.user_id`)

## Segurança

- [ ] Ativar Auth Hook no Dashboard: Authentication → Hooks → custom_access_token_hook (função criada em M17)
- [x] Certificados: Edge Function de verificação pública (supabase/functions/verificar-certificado)

## Links

- [[backlog-features]]
- [[mod-security]]
- [[modelo-registro]]
