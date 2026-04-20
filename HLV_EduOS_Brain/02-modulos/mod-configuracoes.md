---
tags: [modulo, configuracoes, tenant, white-label]
links: [[MOC]], [[modelo-registro]]
---

# ⚙️ mod-configuracoes — Configurações & White-label

**Arquivo:** `js/views/configuracoes.js`
**Rota:** `configuracoes`
**Permissões:** apenas admin/super_admin

## Abas Funcionais

### Instituição
Salva em `tenants`: `nome`, `cnpj`, `email_contato`, `telefone`, `site`, `assinante_certificados`.

### Aparência (White-label)
Salva em `tenants`: `cor_primaria`, `cor_secundaria`, `logo_url`, `tema_padrao`.
- Preview em tempo real ao mover o color picker
- "Salvar e Aplicar" → persiste no banco E aplica imediatamente via `applyBranding()`

### Alertas
Salva `tenants.alertas_renovacao` (JSONB) com auto-save por toggle:
```json
{ "dias_30": true, "dias_7": true, "expirado": false }
```

### Usuários / Segurança / Faturamento
Placeholder "Em breve".

---

## White-label — Como Funciona

**Arquivo:** `js/ui/branding.js`

```
Login bem-sucedido
    ↓
loadAndApplyBranding() → busca tenants WHERE id = tenant_id
    ↓
applyBranding(tenant)
    ├── _applyColors(cor_primaria, cor_secundaria)
    │   └── injeta <style id="tenant-branding"> sobrescrevendo:
    │       --accent, --accent-soft, --accent-hover
    │       --green, --green-soft (todos os 4 temas)
    │       --blue, --blue-soft (cor secundária)
    ├── _applyLogo(logo_url, nome)
    │   └── substitui .sidebar-brand-icon e .login-logo-icon
    │       por <img> quando logo_url está preenchido
    │       ou pela primeira letra do nome
    └── _applyTheme(tema_padrao)
        └── aplica data-theme se não houver preferência pessoal no localStorage
```

---

## Tabela `tenants` — Colunas Completas

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | UUID | gen | Chave primária |
| `nome` | VARCHAR(255) | — | Nome da instituição |
| `cnpj` | VARCHAR(20) | null | CNPJ |
| `logo_url` | TEXT | null | URL do logotipo |
| `cor_primaria` | VARCHAR(20) | `#cc785c` | Accent color principal |
| `cor_secundaria` | VARCHAR(20) | `#5b8af0` | Cor secundária |
| `tema_padrao` | VARCHAR(20) | `neon-glass` | Tema padrão da plataforma |
| `email_contato` | VARCHAR(255) | null | E-mail de contato |
| `telefone` | VARCHAR(20) | null | Telefone |
| `site` | VARCHAR(255) | null | URL do site |
| `assinante_certificados` | VARCHAR(255) | null | Assinante nos certificados |
| `alertas_renovacao` | JSONB | `{"dias_30":true,"dias_7":true,"expirado":false}` | Preferências de alertas |
| `updated_at` | TIMESTAMPTZ | now() | Última atualização |

**Migration:** `SQL/M12_WhiteLabel_Tenants.sql`

---

## Links

- [[modelo-registro]]
- [[decisao-security-crypto]]
- [[visao-geral]]
