---
tags: [banco-de-dados, debitos, todos]
links: [[MOC]], [[backlog-features]]
---

# ⚠️ Débitos Técnicos

## Banco de Dados

- [ ] Edge Function para verificação pública de certificados (policy pública removida)
- [ ] `fn_mark_pagamentos_atrasados` — validar se está sendo chamada via cron ou trigger
- [ ] `autorizar_matricula(aluno_id, curso_id)` — verificar uso no frontend
- [ ] Índice em `alunos(email)` para busca rápida

## Frontend

- [ ] `mod-planning-engine` — não implementado
- [ ] `mod-sla-calculator` — não implementado  
- [ ] Portal do aluno (login via `alunos.user_id`)
- [ ] Portal do instrutor (login via `instrutores.user_id`)

## Segurança

- [ ] Confirmar Auth Hook configurado no Supabase Dashboard
- [ ] Certificados: Edge Function de verificação pública

## Links

- [[backlog-features]]
- [[mod-security]]
- [[modelo-registro]]
