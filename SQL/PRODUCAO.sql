-- ==============================================================================
-- PRODUCAO.sql — HLV EduOS · Schema Único de Produção (v4.0)
-- Gerado em: 2026-04-05
--
-- CORREÇÕES vs versões anteriores (Chain_hlv.sql + patches):
--   [FIX-1] get_tenant_id() com fallback COALESCE (Auth Hook opcional)
--   [FIX-2] Trigger duplo removido — apenas fn_sync_turma_ocupadas permanece
--           (mais completo: trata cancelamento de matrícula)
--   [FIX-3] Demo tenant removido deste arquivo (use Insert_Demo_Tenant.sql)
--   [FIX-4] idx_alunos_email adicionado
--   [FIX-5] fn_mark_pagamentos_atrasados com instrução pg_cron
--
-- ORDEM DE EXECUÇÃO:
--   1. Extensões
--   2. Funções de segurança
--   3. Tabelas (ordem de dependência)
--   4. Views
--   5. Funções de trigger / helpers
--   6. Triggers
--   7. Índices
--   8. RLS enable
--   9. Políticas RLS
--  10. pg_cron (instrução manual — ver seção 10)
--
-- PRÉ-REQUISITOS OBRIGATÓRIOS (configurar no Dashboard Supabase):
--   A. Auth Hook → injeta tenant_id em app_metadata do JWT
--      Authentication > Hooks > Custom Access Token Hook
--   B. Edge Function verificar-certificado (acesso público sem RLS)
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSÕES
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 2. FUNÇÕES DE SEGURANÇA
-- ==============================================================================

-- [FIX-1] Lê tenant_id do JWT; se Auth Hook não estiver configurado,
-- faz fallback na tabela perfis. Permite operar mesmo sem o Hook ativo.
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid AS $$
BEGIN
  RETURN COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid,
    (SELECT tenant_id FROM public.perfis WHERE user_id = auth.uid() LIMIT 1)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Retorna o role do usuário logado sem recursão de RLS
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
DECLARE _role text;
BEGIN
  SELECT role INTO _role
  FROM public.perfis
  WHERE user_id = auth.uid()
    AND tenant_id = public.get_tenant_id()
  LIMIT 1;
  RETURN _role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==============================================================================
-- 3. TABELAS (ordem de dependência)
-- ==============================================================================

CREATE TABLE public.tenants (
    id           UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome         VARCHAR(255) NOT NULL,
    cnpj         VARCHAR(20),
    logo_url     TEXT,
    cor_primaria VARCHAR(20)  DEFAULT '#cc785c',
    created_at   TIMESTAMPTZ  DEFAULT timezone('utc', now())
);

CREATE TABLE public.perfis (
    id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID         REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id  UUID         REFERENCES public.tenants(id) ON DELETE CASCADE,
    nome       VARCHAR(255) NOT NULL,
    role       VARCHAR(50)  NOT NULL CHECK (role IN (
                   'super_admin','admin','coordenador',
                   'secretaria','financeiro','comercial','instrutor','aluno'
               )),
    created_at TIMESTAMPTZ  DEFAULT timezone('utc', now()),
    UNIQUE(user_id, tenant_id)
);

CREATE TABLE public.empresas (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID         REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    nome        VARCHAR(255) NOT NULL,
    cnpj        VARCHAR(20)  UNIQUE,
    responsavel VARCHAR(255),
    email       VARCHAR(255),
    telefone    VARCHAR(20),
    status      VARCHAR(20)  DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
    created_at  TIMESTAMPTZ  DEFAULT timezone('utc', now())
);

CREATE TABLE public.cursos (
    id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID          REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    nome           VARCHAR(255)  NOT NULL,
    codigo         VARCHAR(50)   NOT NULL,   -- ex: 'NR-35'
    carga_horaria  INTEGER       NOT NULL,
    validade_meses INTEGER,                  -- NULL = sem validade
    valor_padrao   DECIMAL(10,2) NOT NULL,
    ativo          BOOLEAN       DEFAULT true,
    created_at     TIMESTAMPTZ   DEFAULT timezone('utc', now()),
    UNIQUE(tenant_id, codigo)
);

CREATE TABLE public.instrutores (
    id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID          REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    user_id        UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
    nome           VARCHAR(255)  NOT NULL,
    email          VARCHAR(255),
    telefone       VARCHAR(20),
    especialidades TEXT[]        DEFAULT '{}',
    avaliacao      DECIMAL(2,1)  DEFAULT 5.0 CHECK (avaliacao BETWEEN 1 AND 5),
    ativo          BOOLEAN       DEFAULT true,
    created_at     TIMESTAMPTZ   DEFAULT timezone('utc', now())
);

CREATE TABLE public.alunos (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID         REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    user_id         UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    nome            VARCHAR(255) NOT NULL,
    -- Documentos: pelo menos um dos três deve ser preenchido (validado no frontend)
    cpf             VARCHAR(20),                                          -- CPF brasileiro (nullable: estrangeiros podem não ter)
    rnm             VARCHAR(9),                                           -- Registro Nacional Migratório (M5)
    cnh_num         VARCHAR(11),                                          -- CNH estrangeira (M5)
    tipo_documento  VARCHAR(20) NOT NULL DEFAULT 'cpf'
                    CHECK (tipo_documento IN ('cpf', 'rnm', 'cnh')),     -- (M4) tipo principal
    email           VARCHAR(255),
    telefone        VARCHAR(20),
    data_nascimento DATE,
    tipo_pessoa     VARCHAR(20)  DEFAULT 'pessoa_fisica' CHECK (tipo_pessoa IN ('pessoa_fisica','empresa')),
    empresa_id      UUID         REFERENCES public.empresas(id) ON DELETE SET NULL,
    status          VARCHAR(20)  DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
    observacoes     TEXT,
    -- Endereço
    cep             VARCHAR(10),
    rua             VARCHAR(255),
    numero          VARCHAR(20),
    complemento     VARCHAR(100),
    bairro          VARCHAR(100),
    cidade          VARCHAR(100),
    uf              VARCHAR(2),
    created_at      TIMESTAMPTZ  DEFAULT timezone('utc', now())
);

-- Partial unique indexes: permitem NULL e evitam duplicatas por tipo de documento
CREATE UNIQUE INDEX idx_alunos_cpf_unique ON public.alunos(tenant_id, cpf)     WHERE cpf     IS NOT NULL;
CREATE UNIQUE INDEX idx_alunos_rnm_unique ON public.alunos(tenant_id, rnm)     WHERE rnm     IS NOT NULL;
CREATE UNIQUE INDEX idx_alunos_cnh_unique ON public.alunos(tenant_id, cnh_num) WHERE cnh_num IS NOT NULL;

CREATE TABLE public.turmas (
    id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID         REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    curso_id       UUID         REFERENCES public.cursos(id) NOT NULL,
    instrutor_id   UUID         REFERENCES public.instrutores(id) ON DELETE SET NULL,
    -- Formato: SIGLA-ANO-SEQ  ex: NR35-2025-003
    codigo         VARCHAR(50)  NOT NULL,
    data_inicio    DATE         NOT NULL,
    data_fim       DATE,
    horario_inicio TIME,
    horario_fim    TIME,
    local          VARCHAR(255),
    link_video     TEXT,
    vagas          INTEGER      NOT NULL CHECK (vagas > 0),
    ocupadas       INTEGER      DEFAULT 0 CHECK (ocupadas >= 0),
    status         VARCHAR(20)  DEFAULT 'agendada' CHECK (status IN (
                       'agendada','em_andamento','concluida','cancelada'
                   )),
    created_at     TIMESTAMPTZ  DEFAULT timezone('utc', now()),
    UNIQUE(tenant_id, codigo)
);

CREATE TABLE public.matriculas (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID         REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    aluno_id    UUID         REFERENCES public.alunos(id) NOT NULL,
    turma_id    UUID         REFERENCES public.turmas(id) ON DELETE SET NULL,
    curso_id    UUID         REFERENCES public.cursos(id) NOT NULL,
    status      VARCHAR(30)  DEFAULT 'matriculado' CHECK (status IN (
                    'matriculado','aguardando_turma','em_andamento',
                    'concluido','certificado_emitido','cancelado'
                )),
    observacoes TEXT,
    created_at  TIMESTAMPTZ  DEFAULT timezone('utc', now()),
    CONSTRAINT uq_matricula_aluno_turma UNIQUE (aluno_id, turma_id)
);

CREATE TABLE public.pagamentos (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID          REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    matricula_id    UUID          REFERENCES public.matriculas(id) ON DELETE CASCADE NOT NULL,
    aluno_id        UUID          REFERENCES public.alunos(id) ON DELETE CASCADE NOT NULL,
    curso_id        UUID          REFERENCES public.cursos(id) ON DELETE SET NULL,
    valor           DECIMAL(10,2) NOT NULL,
    data_vencimento DATE          NOT NULL,
    data_pagamento  DATE,
    status          VARCHAR(20)   DEFAULT 'pendente' CHECK (status IN (
                        'pendente','recebido','atraso','cancelado','isento'
                    )),
    tipo_pagamento  VARCHAR(30)   CHECK (tipo_pagamento IN (
                        'pix','boleto','cartao_credito','cartao_debito',
                        'transferencia','dinheiro','cheque'
                    )),
    recibo          VARCHAR(100),
    created_at      TIMESTAMPTZ   DEFAULT timezone('utc', now())
);

CREATE TABLE public.certificados (
    id                 UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id          UUID         REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    aluno_id           UUID         REFERENCES public.alunos(id) NOT NULL,
    curso_id           UUID         REFERENCES public.cursos(id) NOT NULL,
    turma_id           UUID         REFERENCES public.turmas(id) ON DELETE SET NULL,
    matricula_id       UUID         REFERENCES public.matriculas(id) ON DELETE SET NULL,
    codigo_verificacao VARCHAR(50)  UNIQUE NOT NULL,
    data_emissao       DATE         NOT NULL,
    data_validade      DATE,        -- NULL = sem validade
    status             VARCHAR(20)  DEFAULT 'valido' CHECK (status IN (
                           'valido','a_vencer','vencido','revogado'
                       )),
    created_at         TIMESTAMPTZ  DEFAULT timezone('utc', now())
);

-- ==============================================================================
-- 4. VIEWS
-- ==============================================================================

-- Status calculado em tempo real (sem depender de cron para leitura)
-- Use esta view quando precisar do status atualizado; o campo físico
-- certificados.status é sincronizado pelo fn_mark_pagamentos_atrasados / Edge Function.
CREATE OR REPLACE VIEW public.v_certificados_status AS
SELECT
  *,
  CASE
    WHEN status = 'revogado'                                    THEN 'revogado'
    WHEN data_validade IS NULL                                  THEN 'valido'
    WHEN data_validade < CURRENT_DATE                           THEN 'vencido'
    WHEN data_validade <= CURRENT_DATE + INTERVAL '30 days'     THEN 'a_vencer'
    ELSE 'valido'
  END AS status_calculado
FROM public.certificados;

-- ==============================================================================
-- 5. FUNÇÕES
-- ==============================================================================

-- [FIX-2] Trigger de vagas — versão completa (trata cancelamento de status).
-- Substitui a função atualizar_ocupadas() das versões anteriores.
CREATE OR REPLACE FUNCTION public.fn_sync_turma_ocupadas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- INSERT com turma_id: incrementa
  IF TG_OP = 'INSERT' AND NEW.turma_id IS NOT NULL THEN
    PERFORM 1 FROM public.turmas WHERE id = NEW.turma_id AND ocupadas >= vagas;
    IF FOUND THEN
      RAISE EXCEPTION 'Turma sem vagas disponíveis (capacidade máxima atingida).';
    END IF;
    UPDATE public.turmas
    SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) + 1)
    WHERE id = NEW.turma_id;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Cancelou matrícula que tinha turma → decrementa
    IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' AND OLD.turma_id IS NOT NULL THEN
      UPDATE public.turmas
      SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) - 1)
      WHERE id = OLD.turma_id;

    -- Reativou matrícula cancelada → incrementa
    ELSIF OLD.status = 'cancelado' AND NEW.status <> 'cancelado' AND NEW.turma_id IS NOT NULL THEN
      PERFORM 1 FROM public.turmas WHERE id = NEW.turma_id AND ocupadas >= vagas;
      IF FOUND THEN
        RAISE EXCEPTION 'Turma sem vagas disponíveis.';
      END IF;
      UPDATE public.turmas
      SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) + 1)
      WHERE id = NEW.turma_id;

    -- Mudou de turma → decrementa antiga, incrementa nova
    ELSIF OLD.turma_id IS DISTINCT FROM NEW.turma_id THEN
      IF OLD.turma_id IS NOT NULL AND OLD.status <> 'cancelado' THEN
        UPDATE public.turmas
        SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) - 1)
        WHERE id = OLD.turma_id;
      END IF;
      IF NEW.turma_id IS NOT NULL AND NEW.status <> 'cancelado' THEN
        PERFORM 1 FROM public.turmas WHERE id = NEW.turma_id AND ocupadas >= vagas;
        IF FOUND THEN
          RAISE EXCEPTION 'Turma sem vagas disponíveis.';
        END IF;
        UPDATE public.turmas
        SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) + 1)
        WHERE id = NEW.turma_id;
      END IF;
    END IF;

  -- DELETE com turma_id não cancelado: decrementa
  ELSIF TG_OP = 'DELETE' AND OLD.turma_id IS NOT NULL AND OLD.status <> 'cancelado' THEN
    UPDATE public.turmas
    SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) - 1)
    WHERE id = OLD.turma_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Valida se aluno pode ser matriculado (evita duplicatas ativas e bloqueia se cert válido)
CREATE OR REPLACE FUNCTION public.autorizar_matricula(p_aluno_id UUID, p_curso_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_matricula_ativa BOOLEAN;
    v_cert_valido     BOOLEAN;
    v_cert_vencido    BOOLEAN;
    v_tipo            VARCHAR := 'Nova Matrícula';
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.matriculas
        WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id
          AND status IN ('matriculado','aguardando_turma','em_andamento')
    ) INTO v_matricula_ativa;

    IF v_matricula_ativa THEN
        RETURN jsonb_build_object('autorizado', false, 'motivo', 'Aluno já possui matrícula ativa neste curso.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.certificados
        WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id AND status = 'valido'
    ) INTO v_cert_valido;

    IF v_cert_valido THEN
        RETURN jsonb_build_object('autorizado', false, 'motivo', 'Aluno já possui certificado válido para este curso.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.certificados
        WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id AND status = 'vencido'
    ) INTO v_cert_vencido;

    IF v_cert_vencido THEN v_tipo := 'Renovação/Reciclagem'; END IF;

    RETURN jsonb_build_object('autorizado', true, 'tipo_matricula', v_tipo);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Marca pagamentos vencidos como 'atraso'.
-- Chamada diariamente via pg_cron (ver seção 10).
CREATE OR REPLACE FUNCTION public.fn_mark_pagamentos_atrasados()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE linhas INTEGER;
BEGIN
  UPDATE public.pagamentos
  SET status = 'atraso'
  WHERE status = 'pendente'
    AND data_vencimento < CURRENT_DATE;
  GET DIAGNOSTICS linhas = ROW_COUNT;
  RETURN linhas;
END;
$$;

-- ==============================================================================
-- 6. TRIGGERS
-- ==============================================================================

-- [FIX-2] Remove triggers legados de versões anteriores, se existirem
DROP TRIGGER IF EXISTS trigger_atualizar_ocupadas ON public.matriculas;
DROP TRIGGER IF EXISTS trg_matriculas_ocupadas    ON public.matriculas;

-- Único trigger de controle de vagas
CREATE TRIGGER trg_matriculas_ocupadas
AFTER INSERT OR UPDATE OF status, turma_id OR DELETE
ON public.matriculas
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_turma_ocupadas();

-- ==============================================================================
-- 7. ÍNDICES
-- ==============================================================================

CREATE INDEX idx_alunos_tenant        ON public.alunos(tenant_id);
CREATE INDEX idx_alunos_empresa       ON public.alunos(empresa_id);
CREATE INDEX idx_alunos_email         ON public.alunos(email);         -- [FIX-4] débito técnico

CREATE INDEX idx_turmas_tenant        ON public.turmas(tenant_id);
CREATE INDEX idx_turmas_curso         ON public.turmas(curso_id);
CREATE INDEX idx_turmas_instrutor     ON public.turmas(instrutor_id);

CREATE INDEX idx_matriculas_tenant    ON public.matriculas(tenant_id);
CREATE INDEX idx_matriculas_aluno     ON public.matriculas(aluno_id);
CREATE INDEX idx_matriculas_turma     ON public.matriculas(turma_id);

CREATE INDEX idx_pagamentos_tenant    ON public.pagamentos(tenant_id);
CREATE INDEX idx_pagamentos_aluno     ON public.pagamentos(aluno_id);
CREATE INDEX idx_pagamentos_matricula ON public.pagamentos(matricula_id);
CREATE INDEX idx_pagamentos_vencimento ON public.pagamentos(tenant_id, data_vencimento);

CREATE INDEX idx_certificados_tenant  ON public.certificados(tenant_id);
CREATE INDEX idx_certificados_aluno   ON public.certificados(aluno_id);
CREATE INDEX idx_certificados_codigo  ON public.certificados(codigo_verificacao);
CREATE INDEX idx_certificados_status  ON public.certificados(tenant_id, status);
CREATE INDEX idx_certificados_validade ON public.certificados(tenant_id, data_validade);

-- ==============================================================================
-- 8. ROW LEVEL SECURITY — habilitar
-- ==============================================================================
ALTER TABLE public.tenants      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfis       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cursos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instrutores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alunos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turmas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matriculas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certificados ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 9. POLÍTICAS RLS
-- ==============================================================================

-- ── super_admin: bypass total ──────────────────────────────────────────────────
CREATE POLICY "Super_Admin_Bypass"        ON public.tenants  FOR ALL USING (public.get_user_role() = 'super_admin');
CREATE POLICY "Super_Admin_Bypass_Perfis" ON public.perfis   FOR ALL USING (public.get_user_role() = 'super_admin');

-- ── tenants ───────────────────────────────────────────────────────────────────
CREATE POLICY "Tenants_Leitura"
  ON public.tenants FOR SELECT
  USING (id = public.get_tenant_id());

-- ── perfis ────────────────────────────────────────────────────────────────────
CREATE POLICY "Perfis_Admin_All"
  ON public.perfis FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'admin');

-- Leitura do próprio perfil (necessário no login antes de ter tenant_id no JWT)
CREATE POLICY "Perfis_Proprio_Leitura"
  ON public.perfis FOR SELECT
  USING (user_id = auth.uid());

-- ── empresas ──────────────────────────────────────────────────────────────────
CREATE POLICY "Empresas_Admin_Comercial_All"
  ON public.empresas FOR ALL
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() IN ('admin','comercial'));

CREATE POLICY "Empresas_Outros_Select"
  ON public.empresas FOR SELECT
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() IN ('secretaria','financeiro','coordenador'));

-- ── cursos ────────────────────────────────────────────────────────────────────
CREATE POLICY "Cursos_Admin_Coord_All"
  ON public.cursos FOR ALL
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() IN ('admin','coordenador'));

CREATE POLICY "Cursos_Todos_Select"
  ON public.cursos FOR SELECT
  USING (tenant_id = public.get_tenant_id());

-- ── instrutores ───────────────────────────────────────────────────────────────
CREATE POLICY "Instrutores_Admin_Coord_All"
  ON public.instrutores FOR ALL
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() IN ('admin','coordenador'));

CREATE POLICY "Instrutores_Select"
  ON public.instrutores FOR SELECT
  USING (tenant_id = public.get_tenant_id());

-- ── alunos ────────────────────────────────────────────────────────────────────
CREATE POLICY "Alunos_Geral_All"
  ON public.alunos FOR ALL
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() IN ('admin','secretaria','comercial'));

CREATE POLICY "Alunos_Coord_Select"
  ON public.alunos FOR SELECT
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() = 'coordenador');

CREATE POLICY "Alunos_Proprio_Select"
  ON public.alunos FOR SELECT
  USING (tenant_id = public.get_tenant_id() AND user_id = auth.uid());

-- ── turmas ────────────────────────────────────────────────────────────────────
CREATE POLICY "Turmas_Admin_Coord_All"
  ON public.turmas FOR ALL
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() IN ('admin','coordenador'));

CREATE POLICY "Turmas_Geral_Select"
  ON public.turmas FOR SELECT
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() IN ('secretaria','comercial','financeiro','aluno'));

CREATE POLICY "Turmas_Instrutor_Propria_All"
  ON public.turmas FOR ALL
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'instrutor'
    AND instrutor_id = (SELECT id FROM public.instrutores WHERE user_id = auth.uid() LIMIT 1)
  );

-- ── matrículas ────────────────────────────────────────────────────────────────
CREATE POLICY "Matriculas_Geral_All"
  ON public.matriculas FOR ALL
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() IN ('admin','secretaria','comercial'));

CREATE POLICY "Matriculas_Coord_Select"
  ON public.matriculas FOR SELECT
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() = 'coordenador');

CREATE POLICY "Matriculas_Aluno_Select"
  ON public.matriculas FOR SELECT
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'aluno'
    AND aluno_id = (SELECT id FROM public.alunos WHERE user_id = auth.uid() LIMIT 1)
  );

-- ── pagamentos ────────────────────────────────────────────────────────────────
CREATE POLICY "Pagamentos_Admin_Fin_All"
  ON public.pagamentos FOR ALL
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() IN ('admin','financeiro'));

-- Coordenador precisa de SELECT para módulo de relatórios e dashboard
CREATE POLICY "Pagamentos_Coord_Select"
  ON public.pagamentos FOR SELECT
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() = 'coordenador');

CREATE POLICY "Pagamentos_Aluno_Select"
  ON public.pagamentos FOR SELECT
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'aluno'
    AND aluno_id = (SELECT id FROM public.alunos WHERE user_id = auth.uid() LIMIT 1)
  );

-- ── certificados ─────────────────────────────────────────────────────────────
-- Verificação pública REMOVIDA — usar Edge Function verificar-certificado
CREATE POLICY "Certificados_Geral_All"
  ON public.certificados FOR ALL
  USING (tenant_id = public.get_tenant_id()
         AND public.get_user_role() IN ('admin','coordenador','secretaria'));

CREATE POLICY "Certificados_Aluno_Select"
  ON public.certificados FOR SELECT
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'aluno'
    AND aluno_id = (SELECT id FROM public.alunos WHERE user_id = auth.uid() LIMIT 1)
  );

-- ==============================================================================
-- 10. pg_cron — MARCAR PAGAMENTOS EM ATRASO
-- ==============================================================================
-- Execute MANUALMENTE no SQL Editor após habilitar a extensão pg_cron no projeto.
-- Habilitar: Dashboard > Database > Extensions > pg_cron
--
-- Agendamento diário à meia-noite (UTC):
--
--   SELECT cron.schedule(
--     'mark-pagamentos-atrasados',
--     '0 0 * * *',
--     'SELECT public.fn_mark_pagamentos_atrasados()'
--   );
--
-- Teste manual:
--   SELECT public.fn_mark_pagamentos_atrasados();
--
-- ==============================================================================

-- ==============================================================================
-- CHECKLIST PÓS-EXECUÇÃO
-- ==============================================================================
-- [ ] Auth Hook configurado:
--       Dashboard > Authentication > Hooks > Custom Access Token Hook
--       Edge Function retorna: { app_metadata: { tenant_id: "uuid", role: "admin" } }
--
-- [ ] Edge Function verificar-certificado criada:
--       POST /functions/v1/verificar-certificado
--       Body: { "codigo": "CERT-XXXX" }
--       Usa service_role internamente; sem RLS pública.
--       Retorna: { aluno, curso, data_emissao, data_validade, status_calculado }
--
-- [ ] pg_cron agendado (ver seção 10 acima)
--
-- [ ] Seed de dados demo: Execute SQL/Insert_Demo_Tenant.sql separadamente
-- ==============================================================================
