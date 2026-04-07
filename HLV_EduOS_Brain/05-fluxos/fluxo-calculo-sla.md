---
tags: [fluxo, sla, calculo]
links: [[MOC]], [[mod-sla-calculator]], [[api-sla-calculator]]
---

# 🔄 Fluxo de Cálculo de SLA

> Módulo em desenvolvimento — referenciado no grafo do projeto.

## Conceito

Calculadora de SLA para cursos: determina prazo de validade, alertas de vencimento e projeção de renovações.

## Inputs esperados

- `data_emissao` do certificado
- `validade_meses` do curso
- Data atual

## Outputs

- `data_validade`
- `status` do certificado (`valido` | `a_vencer` | `vencido`)
- Dias restantes

## Links

- [[mod-sla-calculator]]
- [[mod-certificados]]
- [[mod-renovacoes]]
