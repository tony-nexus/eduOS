-- ==============================================================================
-- EduOS_Schema.sql — Schema Completo Supabase (v4.0 — PRODUCAO READY)
-- Arquivo unico consolidado — inclui tabelas, triggers, indices, RLS,
-- migracoes de endereco, RPC de matricula e triggers de datas.
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSOES E FUNCOES DE SEGURANCA
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Le tenant_id do JWT (injetado pelo Auth Hook do Supabase)
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS uuid AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid;
$$ LANGUAGE sql STABLE;

-- Retorna o role do usuario logado sem recursao de RLS
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
-- 2. FUNCAO: ATUALIZAR VAGAS OCUPADAS (com guard de capacidade)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.atualizar_ocupadas()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.turma_id IS NOT NULL THEN
    PERFORM 1 FROM public.turmas WHERE id = NEW.turma_id AND ocupadas >= vagas;
    IF FOUND THEN
      RAISE EXCEPTION 'Turma sem vagas disponiveis (capacidade maxima atingida).';
    END IF;
    UPDATE public.turmas SET ocupadas = ocupadas + 1 WHERE id = NEW.turma_id;

  ELSIF TG_OP = 'DELETE' AND OLD.turma_id IS NOT NULL THEN
    UPDATE public.turmas SET ocupadas = GREATEST(ocupadas - 1, 0) WHERE id = OLD.turma_id;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.turma_id IS DISTINCT FROM NEW.turma_id THEN
      IF OLD.turma_id IS NOT NULL THEN
        UPDATE public.turmas SET ocupadas = GREATEST(ocupadas - 1, 0) WHERE id = OLD.turma_id;
      END IF;
      IF NEW.turma_id IS NOT NULL THEN
        PERFORM 1 FROM public.turmas WHERE id = NEW.turma_id AND ocupadas >= vagas;
        IF FOUND THEN
          RAISE EXCEPTION 'Turma sem vagas disponiveis.';
        END IF;
        UPDATE public.turmas SET ocupadas = ocupadas + 1 WHERE id = NEW.turma_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 3. TABELAS
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
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id  UUID        REFERENCES public.tenants(id) ON DELETE CASCADE,
    nome       VARCHAR(255) NOT NULL,
    role       VARCHAR(50)  NOT NULL CHECK (role IN (
                   'super_admin','admin','coordenador',
                   'secretaria','financeiro','comercial','instrutor','aluno'
               )),
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE(user_id, tenant_id)
);

CREATE TABLE public.empresas (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id   UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    nome        VARCHAR(255) NOT NULL,
    cnpj        VARCHAR(20)  UNIQUE,
    responsavel VARCHAR(255),
    email       VARCHAR(255),
    telefone    VARCHAR(20),
    status      VARCHAR(20)  DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
    created_at  TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE TABLE public.cursos (
    id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID         REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    nome           VARCHAR(255) NOT NULL,
    codigo         VARCHAR(50)  NOT NULL,
    carga_horaria  INTEGER      NOT NULL,
    validade_meses INTEGER,
    valor_padrao   DECIMAL(10,2) NOT NULL,
    ativo          BOOLEAN      DEFAULT true,
    created_at     TIMESTAMPTZ  DEFAULT timezone('utc', now()),
    UNIQUE(tenant_id, codigo)
);

CREATE TABLE public.instrutores (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    user_id        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    nome           VARCHAR(255) NOT NULL,
    email          VARCHAR(255),
    telefone       VARCHAR(20),
    especialidades TEXT[]       DEFAULT '{}',
    avaliacao      DECIMAL(2,1) DEFAULT 5.0 CHECK (avaliacao BETWEEN 1 AND 5),
    ativo          BOOLEAN     DEFAULT true,
    created_at     TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE TABLE public.alunos (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    user_id         UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
    nome            VARCHAR(255) NOT NULL,
    cpf             VARCHAR(14)  NOT NULL,
    email           VARCHAR(255),
    telefone        VARCHAR(20),
    data_nascimento DATE,
    tipo_pessoa     VARCHAR(20)  DEFAULT 'pessoa_fisica' CHECK (tipo_pessoa IN ('pessoa_fisica','empresa')),
    empresa_id      UUID        REFERENCES public.empresas(id) ON DELETE SET NULL,
    status          VARCHAR(20)  DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
    observacoes     TEXT,
    -- Endereco
    cep             VARCHAR(10),
    rua             VARCHAR(255),
    numero          VARCHAR(20),
    complemento     VARCHAR(100),
    bairro          VARCHAR(100),
    cidade          VARCHAR(100),
    uf              VARCHAR(2),
    -- Data de cadastro (automatica)
    created_at      TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE(tenant_id, cpf)
);

CREATE TABLE public.turmas (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    curso_id       UUID        REFERENCES public.cursos(id) NOT NULL,
    instrutor_id   UUID        REFERENCES public.instrutores(id) ON DELETE SET NULL,
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
    created_at     TIMESTAMPTZ DEFAULT timezone('utc', now()),
    UNIQUE(tenant_id, codigo)
);

CREATE TABLE public.matriculas (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id      UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    aluno_id       UUID        REFERENCES public.alunos(id) NOT NULL,
    turma_id       UUID        REFERENCES public.turmas(id) ON DELETE SET NULL,
    curso_id       UUID        REFERENCES public.cursos(id) NOT NULL,
    data_matricula DATE        DEFAULT CURRENT_DATE,
    data_conclusao DATE,
    status         VARCHAR(30)  DEFAULT 'matriculado' CHECK (status IN (
                       'matriculado','aguardando_turma','em_andamento',
                       'concluido','certificado_emitido','cancelado'
                   )),
    observacoes    TEXT,
    created_at     TIMESTAMPTZ DEFAULT timezone('utc', now()),
    CONSTRAINT uq_matricula_aluno_turma UNIQUE (aluno_id, turma_id)
);

CREATE TABLE public.pagamentos (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    matricula_id    UUID        REFERENCES public.matriculas(id) ON DELETE CASCADE NOT NULL,
    aluno_id        UUID        REFERENCES public.alunos(id) ON DELETE CASCADE NOT NULL,
    curso_id        UUID        REFERENCES public.cursos(id) ON DELETE SET NULL,
    valor           DECIMAL(10,2) NOT NULL,
    data_vencimento DATE         NOT NULL,
    data_pagamento  DATE,
    status          VARCHAR(20)  DEFAULT 'pendente' CHECK (status IN (
                        'pendente','recebido','atraso','cancelado','isento'
                    )),
    tipo_pagamento  VARCHAR(30) CHECK (tipo_pagamento IN (
                        'pix','boleto','cartao_credito','cartao_debito',
                        'transferencia','dinheiro'
                    )),
    recibo          VARCHAR(100),
    created_at      TIMESTAMPTZ DEFAULT timezone('utc', now())
);

CREATE TABLE public.certificados (
    id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id          UUID        REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    aluno_id           UUID        REFERENCES public.alunos(id) NOT NULL,
    curso_id           UUID        REFERENCES public.cursos(id) NOT NULL,
    turma_id           UUID        REFERENCES public.turmas(id) ON DELETE SET NULL,
    matricula_id       UUID        REFERENCES public.matriculas(id) ON DELETE SET NULL,
    codigo_verificacao VARCHAR(50)  UNIQUE NOT NULL,
    data_emissao       DATE         NOT NULL,
    data_validade      DATE,
    status             VARCHAR(20)  DEFAULT 'valido' CHECK (status IN (
                           'valido','a_vencer','vencido','revogado'
                       )),
    created_at         TIMESTAMPTZ DEFAULT timezone('utc', now())
);

-- ==============================================================================
-- 4. VIEW: STATUS CALCULADO DE CERTIFICADOS
-- ==============================================================================
CREATE OR REPLACE VIEW public.v_certificados_status AS
SELECT
  *,
  CASE
    WHEN status = 'revogado' THEN 'revogado'
    WHEN data_validade IS NULL THEN 'valido'
    WHEN data_validade < CURRENT_DATE THEN 'vencido'
    WHEN data_validade <= CURRENT_DATE + INTERVAL '30 days' THEN 'a_vencer'
    ELSE 'valido'
  END AS status_calculado
FROM public.certificados;

-- ==============================================================================
-- 5. TRIGGERS
-- ==============================================================================

-- Trigger de vagas ocupadas
CREATE TRIGGER trigger_atualizar_ocupadas
  AFTER INSERT OR UPDATE OR DELETE ON public.matriculas
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_ocupadas();

-- Trigger de sincronizacao avancada de vagas (fallback robusto)
CREATE OR REPLACE FUNCTION fn_sync_turma_ocupadas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.turma_id IS NOT NULL THEN
    UPDATE turmas
    SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) + 1)
    WHERE id = NEW.turma_id;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' AND OLD.turma_id IS NOT NULL THEN
      UPDATE turmas
      SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) - 1)
      WHERE id = OLD.turma_id;
    ELSIF OLD.status = 'cancelado' AND NEW.status <> 'cancelado' AND NEW.turma_id IS NOT NULL THEN
      UPDATE turmas
      SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) + 1)
      WHERE id = NEW.turma_id;
    ELSIF OLD.turma_id IS DISTINCT FROM NEW.turma_id THEN
      IF OLD.turma_id IS NOT NULL THEN
        UPDATE turmas SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) - 1) WHERE id = OLD.turma_id;
      END IF;
      IF NEW.turma_id IS NOT NULL THEN
        UPDATE turmas SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) + 1) WHERE id = NEW.turma_id;
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' AND OLD.turma_id IS NOT NULL AND OLD.status <> 'cancelado' THEN
    UPDATE turmas
    SET ocupadas = GREATEST(0, COALESCE(ocupadas, 0) - 1)
    WHERE id = OLD.turma_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_matriculas_ocupadas ON matriculas;
CREATE TRIGGER trg_matriculas_ocupadas
AFTER INSERT OR UPDATE OF status, turma_id OR DELETE
ON matriculas
FOR EACH ROW
EXECUTE FUNCTION fn_sync_turma_ocupadas();

-- Trigger: preenche data_conclusao automaticamente ao concluir
CREATE OR REPLACE FUNCTION public.atualizar_data_conclusao()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status IN ('concluido', 'certificado_emitido') THEN
      NEW.data_conclusao := CURRENT_DATE;
    ELSIF OLD.status IN ('concluido', 'certificado_emitido')
      AND NEW.status NOT IN ('concluido', 'certificado_emitido') THEN
      NEW.data_conclusao := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_atualizar_conclusao ON public.matriculas;
CREATE TRIGGER trg_atualizar_conclusao
  BEFORE UPDATE OF status ON public.matriculas
  FOR EACH ROW EXECUTE FUNCTION public.atualizar_data_conclusao();

-- ==============================================================================
-- 6. INDICES
-- ==============================================================================
CREATE INDEX idx_alunos_tenant          ON public.alunos(tenant_id);
CREATE INDEX idx_alunos_empresa         ON public.alunos(empresa_id);
CREATE INDEX idx_turmas_tenant          ON public.turmas(tenant_id);
CREATE INDEX idx_turmas_curso           ON public.turmas(curso_id);
CREATE INDEX idx_turmas_instrutor       ON public.turmas(instrutor_id);
CREATE INDEX idx_matriculas_tenant      ON public.matriculas(tenant_id);
CREATE INDEX idx_matriculas_aluno       ON public.matriculas(aluno_id);
CREATE INDEX idx_matriculas_turma       ON public.matriculas(turma_id);
CREATE INDEX idx_pagamentos_tenant      ON public.pagamentos(tenant_id);
CREATE INDEX idx_pagamentos_aluno       ON public.pagamentos(aluno_id);
CREATE INDEX idx_pagamentos_matricula   ON public.pagamentos(matricula_id);
CREATE INDEX idx_pagamentos_vencimento  ON public.pagamentos(tenant_id, data_vencimento);
CREATE INDEX idx_certificados_tenant    ON public.certificados(tenant_id);
CREATE INDEX idx_certificados_aluno     ON public.certificados(aluno_id);
CREATE INDEX idx_certificados_codigo    ON public.certificados(codigo_verificacao);
CREATE INDEX idx_certificados_status    ON public.certificados(tenant_id, status);
CREATE INDEX idx_certificados_validade  ON public.certificados(tenant_id, data_validade);

-- ==============================================================================
-- 7. ROW LEVEL SECURITY
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
-- 8. POLITICAS RLS
-- ==============================================================================

-- Super Admin
CREATE POLICY "Super_Admin_Bypass"        ON public.tenants      FOR ALL USING (public.get_user_role() = 'super_admin');
CREATE POLICY "Super_Admin_Bypass_Perfis" ON public.perfis       FOR ALL USING (public.get_user_role() = 'super_admin');

-- Tenants & Perfis
CREATE POLICY "Tenants_Leitura"           ON public.tenants      FOR SELECT USING (id = public.get_tenant_id());
CREATE POLICY "Perfis_Admin_All"          ON public.perfis       FOR ALL    USING (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'admin');
CREATE POLICY "Perfis_Proprio_Leitura"   ON public.perfis       FOR SELECT USING (user_id = auth.uid());

-- Empresas
CREATE POLICY "Empresas_Admin_Comercial_All" ON public.empresas FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','comercial'));
CREATE POLICY "Empresas_Outros_Select"       ON public.empresas FOR SELECT
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('secretaria','financeiro','coordenador'));

-- Cursos
CREATE POLICY "Cursos_Admin_Coord_All"  ON public.cursos FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','coordenador'));
CREATE POLICY "Cursos_Todos_Select"     ON public.cursos FOR SELECT
  USING (tenant_id = public.get_tenant_id());

-- Instrutores
CREATE POLICY "Instrutores_Admin_All"   ON public.instrutores FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','coordenador'));
CREATE POLICY "Instrutores_Select"      ON public.instrutores FOR SELECT
  USING (tenant_id = public.get_tenant_id());

-- Alunos
CREATE POLICY "Alunos_Geral_All"        ON public.alunos FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','secretaria','comercial'));
CREATE POLICY "Alunos_Coord_Select"     ON public.alunos FOR SELECT
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'coordenador');
CREATE POLICY "Alunos_Proprio_Select"   ON public.alunos FOR SELECT
  USING (tenant_id = public.get_tenant_id() AND user_id = auth.uid());

-- Turmas
CREATE POLICY "Turmas_Admin_Coord_All"       ON public.turmas FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','coordenador'));
CREATE POLICY "Turmas_Geral_Select"          ON public.turmas FOR SELECT
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('secretaria','comercial','aluno','financeiro'));
CREATE POLICY "Turmas_Instrutor_Propria_All" ON public.turmas FOR ALL
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'instrutor'
    AND instrutor_id = (SELECT id FROM public.instrutores WHERE user_id = auth.uid() LIMIT 1)
  );

-- Matriculas
CREATE POLICY "Matriculas_Geral_All"     ON public.matriculas FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','secretaria','comercial'));
CREATE POLICY "Matriculas_Coord_Select"  ON public.matriculas FOR SELECT
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'coordenador');
CREATE POLICY "Matriculas_Aluno_Select"  ON public.matriculas FOR SELECT
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'aluno'
    AND aluno_id = (SELECT id FROM public.alunos WHERE user_id = auth.uid() LIMIT 1)
  );

-- Pagamentos
CREATE POLICY "Pagamentos_Fin_Admin_All"  ON public.pagamentos FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','financeiro'));
CREATE POLICY "Pagamentos_Aluno_Select"   ON public.pagamentos FOR SELECT
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'aluno'
    AND aluno_id = (SELECT id FROM public.alunos WHERE user_id = auth.uid() LIMIT 1)
  );

-- Certificados
CREATE POLICY "Certificados_Geral_All"    ON public.certificados FOR ALL
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('admin','coordenador','secretaria'));
CREATE POLICY "Certificados_Aluno_Select" ON public.certificados FOR SELECT
  USING (
    tenant_id = public.get_tenant_id()
    AND public.get_user_role() = 'aluno'
    AND aluno_id = (SELECT id FROM public.alunos WHERE user_id = auth.uid() LIMIT 1)
  );

-- ==============================================================================
-- 9. FUNCOES AUXILIARES
-- ==============================================================================

-- RPC: Autorizar matricula (previne duplicatas ativas e classifica renovacoes)
CREATE OR REPLACE FUNCTION public.autorizar_matricula(p_aluno_id UUID, p_curso_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_matricula_ativa BOOLEAN;
    v_cert_valido BOOLEAN;
    v_cert_vencido BOOLEAN;
    v_tipo VARCHAR := 'Nova Matricula';
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.matriculas
        WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id
        AND status IN ('matriculado', 'aguardando_turma', 'em_andamento')
    ) INTO v_matricula_ativa;

    IF v_matricula_ativa THEN
        RETURN jsonb_build_object('autorizado', false, 'motivo', 'Aluno ja possui matricula ativa neste curso.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.certificados
        WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id AND status = 'valido'
    ) INTO v_cert_valido;

    IF v_cert_valido THEN
        RETURN jsonb_build_object('autorizado', false, 'motivo', 'Aluno ja possui um certificado valido para este curso.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.certificados
        WHERE aluno_id = p_aluno_id AND curso_id = p_curso_id AND status = 'vencido'
    ) INTO v_cert_vencido;

    IF v_cert_vencido THEN
        v_tipo := 'Renovacao/Reciclagem';
    END IF;

    RETURN jsonb_build_object('autorizado', true, 'tipo_matricula', v_tipo);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Funcao: Marcar pagamentos em atraso automaticamente
CREATE OR REPLACE FUNCTION fn_mark_pagamentos_atrasados()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  linhas_afetadas INTEGER;
BEGIN
  UPDATE pagamentos
  SET status = 'atraso'
  WHERE status = 'pendente'
    AND data_vencimento < CURRENT_DATE;

  GET DIAGNOSTICS linhas_afetadas = ROW_COUNT;
  RETURN linhas_afetadas;
END;
$$;

-- Para agendar via pg_cron (executar 1x por dia a meia-noite):
-- SELECT cron.schedule('mark-atrasados', '0 0 * * *', 'SELECT fn_mark_pagamentos_atrasados()');
