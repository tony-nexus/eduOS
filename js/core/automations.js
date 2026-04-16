/**
 * /js/core/automations.js
 * Motor de automações do EduOS.
 *
 * Objetivo: reduzir interações humanas ao mínimo — apenas:
 *   - Cadastrar alunos
 *   - Cadastrar instrutores
 *   - Validar pagamentos
 *
 * Tudo o mais acontece aqui automaticamente.
 *
 * Funções exportadas:
 *   runAutomations()           — executa todas as automações, retorna sumário
 *   autoSyncTurmaStatus()      — avança turmas/matrículas pelos status com base em datas
 *   autoEmitirCertificados()   — emite certs para matrículas concluídas sem pendências
 *   autoEnrollAguardando()     — enrolam alunos em espera quando nova turma é criada
 */

import { supabase, getTenantId } from './supabase.js';

// ─── Helper: verifica sobreposição de datas entre duas turmas ─────────────────
// Retorna true se os períodos se sobrepõem (= conflito de horário)
// data_fim null = turma sem data de encerramento → assume vigência infinita
export function datasConflitam(inicio1, fim1, inicio2, fim2) {
  if (!inicio1 || !inicio2) return false;
  const FAR = '2099-12-31';
  return inicio1 <= (fim2 || FAR) && inicio2 <= (fim1 || FAR);
}

// ─── Executor geral ───────────────────────────────────────────────────────────
export async function runAutomations() {
  const [tResult, cResult] = await Promise.allSettled([
    autoSyncTurmaStatus(),
    autoEmitirCertificados(),
  ]);
  return {
    turmasAvancadas: tResult.status === 'fulfilled' ? (tResult.value ?? 0) : 0,
    certEmitidos:    cResult.status === 'fulfilled' ? (cResult.value ?? 0) : 0,
  };
}

// ─── 1. Avança status de turmas por data ─────────────────────────────────────
/**
 * agendada → em_andamento : quando data_inicio <= hoje
 * em_andamento → concluida : quando data_fim <= hoje (e data_fim preenchida)
 *
 * Propaga automaticamente para as matrículas da turma:
 *   matriculado | aguardando_turma → em_andamento
 *   em_andamento → concluido
 *
 * Retorna quantas turmas foram avançadas.
 */
export async function autoSyncTurmaStatus() {
  const tenant = getTenantId();
  const hoje   = new Date().toISOString().split('T')[0];
  let   count  = 0;

  try {
    // ── agendada → em_andamento ────────────────────────────────────────────
    const { data: iniciadas, error: e1 } = await supabase
      .from('turmas')
      .update({ status: 'em_andamento' })
      .eq('tenant_id', tenant)
      .eq('status', 'agendada')
      .lte('data_inicio', hoje)
      .select('id');

    if (!e1 && iniciadas?.length) {
      count += iniciadas.length;
      // Avança matrículas das turmas iniciadas
      await supabase
        .from('matriculas')
        .update({ status: 'em_andamento' })
        .eq('tenant_id', tenant)
        .in('turma_id', iniciadas.map(t => t.id))
        .in('status', ['matriculado', 'aguardando_turma']);
    }

    // ── em_andamento → concluida ───────────────────────────────────────────
    const { data: concluidas, error: e2 } = await supabase
      .from('turmas')
      .update({ status: 'concluida' })
      .eq('tenant_id', tenant)
      .eq('status', 'em_andamento')
      .not('data_fim', 'is', null)
      .lte('data_fim', hoje)
      .select('id');

    if (!e2 && concluidas?.length) {
      count += concluidas.length;
      // Avança matrículas das turmas concluídas
      await supabase
        .from('matriculas')
        .update({ status: 'concluido' })
        .eq('tenant_id', tenant)
        .in('turma_id', concluidas.map(t => t.id))
        .eq('status', 'em_andamento');
    }
  } catch (err) {
    console.warn('[Automations] autoSyncTurmaStatus falhou:', err.message);
  }

  return count;
}

// ─── 2. Auto-emissão de certificados ─────────────────────────────────────────
/**
 * Para cada matrícula com status='concluido':
 *   - Não tem certificado válido/a_vencer já emitido?
 *   - Não tem pagamentos pendentes/em atraso?
 *   → Emite certificado automaticamente e avança para 'certificado_emitido'
 *
 * Retorna quantos certificados foram emitidos.
 */
export async function autoEmitirCertificados() {
  const tenant = getTenantId();
  let   count  = 0;

  try {
    const { data: matriculas } = await supabase
      .from('matriculas')
      .select('id, aluno_id, curso_id')
      .eq('tenant_id', tenant)
      .eq('status', 'concluido')
      .limit(50);

    if (!matriculas?.length) return 0;

    for (const m of matriculas) {
      // Já tem certificado válido ou a vencer?
      const { count: certExiste } = await supabase
        .from('certificados')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant)
        .eq('aluno_id', m.aluno_id)
        .eq('curso_id', m.curso_id)
        .in('status', ['valido', 'a_vencer']);
      if (certExiste > 0) continue;

      // Tem pagamentos em aberto?
      const { count: pagAberto } = await supabase
        .from('pagamentos')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant)
        .eq('matricula_id', m.id)
        .in('status', ['pendente', 'atraso']);
      if (pagAberto > 0) continue;

      // Busca validade do curso para calcular data_validade
      const { data: curso } = await supabase
        .from('cursos')
        .select('validade_meses')
        .eq('id', m.curso_id)
        .single();

      const hoje   = new Date();
      const meses  = curso?.validade_meses ?? null; // null = vitalício
      let dataValidade = null;
      if (meses !== null) {
        dataValidade = new Date(hoje);
        dataValidade.setMonth(dataValidade.getMonth() + meses);
      }

      // Gera código único de verificação
      const codigo =
        'CRT-' +
        Math.random().toString(36).slice(2, 8).toUpperCase() +
        '-' +
        Date.now().toString(36).toUpperCase();

      const { error: eInsert } = await supabase.from('certificados').insert({
        tenant_id:          tenant,
        aluno_id:           m.aluno_id,
        curso_id:           m.curso_id,
        data_emissao:       hoje.toISOString().split('T')[0],
        data_validade:      dataValidade ? dataValidade.toISOString().split('T')[0] : null,
        status:             'valido',
        codigo_verificacao: codigo,
      });

      if (!eInsert) {
        // Avança pipeline para certificado_emitido
        await supabase
          .from('matriculas')
          .update({ status: 'certificado_emitido' })
          .eq('id', m.id)
          .eq('tenant_id', tenant);
        count++;
      }
    }
  } catch (err) {
    console.warn('[Automations] autoEmitirCertificados falhou:', err.message);
  }

  return count;
}

// ─── 3. Auto-enroll de alunos em espera ──────────────────────────────────────
/**
 * Quando uma nova turma é criada, procura matrículas com status='aguardando_turma'
 * para o mesmo curso e vincula-as automaticamente (FIFO, respeitando vagas e
 * conflito de datas com outras turmas ativas do aluno).
 *
 * Retorna quantas matrículas foram vinculadas.
 */
export async function autoEnrollAguardando(turmaId, cursoId, vagas) {
  const tenant = getTenantId();
  let   count  = 0;

  try {
    // Carrega dados completos da turma destino (precisa das datas)
    const { data: turmaDestino } = await supabase
      .from('turmas')
      .select('id, data_inicio, data_fim, status')
      .eq('id', turmaId)
      .eq('tenant_id', tenant)
      .single();

    if (!turmaDestino || turmaDestino.status !== 'agendada') return 0;

    // Busca alunos em espera para este curso (FIFO)
    const { data: aguardando } = await supabase
      .from('matriculas')
      .select('id, aluno_id')
      .eq('tenant_id', tenant)
      .eq('curso_id', cursoId)
      .eq('status', 'aguardando_turma')
      .is('turma_id', null)
      .order('created_at', { ascending: true })
      .limit(vagas);

    if (!aguardando?.length) return 0;

    for (const m of aguardando) {
      // Verifica conflito de datas com turmas ativas do aluno
      if (turmaDestino.data_inicio) {
        const { data: mAtivas } = await supabase
          .from('matriculas')
          .select('turma:turma_id(data_inicio, data_fim)')
          .eq('tenant_id', tenant)
          .eq('aluno_id', m.aluno_id)
          .in('status', ['em_andamento', 'matriculado'])
          .not('turma_id', 'is', null);

        const turmasAtivas = (mAtivas ?? []).map(r => r.turma).filter(Boolean);
        const conflito = turmasAtivas.some(ta =>
          datasConflitam(turmaDestino.data_inicio, turmaDestino.data_fim, ta.data_inicio, ta.data_fim)
        );
        if (conflito) continue; // mantém em aguardando, não vincula
      }

      const { error } = await supabase
        .from('matriculas')
        .update({ turma_id: turmaId, status: 'matriculado' })
        .eq('id', m.id)
        .eq('tenant_id', tenant);
      if (!error) count++;
    }
  } catch (err) {
    console.warn('[Automations] autoEnrollAguardando falhou:', err.message);
  }

  return count;
}

// ─── 4. Cria matrícula de renovação ──────────────────────────────────────────
/**
 * Usado em renovacoes.js para criar uma nova matrícula de renovação
 * para um aluno com certificado vencido/crítico.
 * Evita duplicar se já houver matrícula ativa.
 *
 * Retorna { ok: true } ou { ok: false, reason: string }
 */
export async function criarRenovacao(alunoId, cursoId) {
  const tenant = getTenantId();
  const statusAtivos = ['matriculado', 'aguardando_turma', 'em_andamento', 'concluido'];

  try {
    // Verifica se já tem matrícula ativa para este aluno+curso
    const { data: existing } = await supabase
      .from('matriculas')
      .select('id, status')
      .eq('tenant_id', tenant)
      .eq('aluno_id', alunoId)
      .eq('curso_id', cursoId);

    const hasActive = (existing ?? []).some(m => statusAtivos.includes(m.status));
    if (hasActive) {
      return { ok: false, reason: 'Aluno já possui matrícula ativa neste curso.' };
    }

    const { error } = await supabase.from('matriculas').insert({
      tenant_id: tenant,
      aluno_id:  alunoId,
      curso_id:  cursoId,
      status:    'aguardando_turma',
    });

    if (error) throw error;
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

// ─── 5. Cria matrícula automática ao cadastrar aluno ─────────────────────────
/**
 * Chamado por alunos.js quando um novo aluno é criado com "Curso de Interesse".
 * Se houver turma disponível → vincula imediatamente.
 * Se não houver → cria com status aguardando_turma.
 *
 * Retorna { ok, turma_code } onde turma_code é o código da turma vinculada (ou null).
 */
export async function criarMatriculaAutomatica(alunoId, cursoId) {
  const tenant = getTenantId();

  try {
    // Turmas agendadas com vaga (em_andamento nunca aceita novas matrículas)
    const { data: turmas } = await supabase
      .from('turmas')
      .select('id, codigo, vagas, ocupadas, data_inicio, data_fim')
      .eq('tenant_id', tenant)
      .eq('curso_id', cursoId)
      .eq('status', 'agendada')
      .order('data_inicio', { ascending: true });

    // Turmas ativas do aluno para detectar conflito de datas
    const { data: mAtivas } = await supabase
      .from('matriculas')
      .select('turma:turma_id(data_inicio, data_fim)')
      .eq('tenant_id', tenant)
      .eq('aluno_id', alunoId)
      .in('status', ['em_andamento', 'matriculado'])
      .not('turma_id', 'is', null);

    const turmasAtivas = (mAtivas ?? []).map(r => r.turma).filter(Boolean);

    // Primeira turma com vaga e sem conflito de datas
    const turmaDisponivel = (turmas ?? []).find(t => {
      if ((t.ocupadas ?? 0) >= (t.vagas ?? 0)) return false;
      return !turmasAtivas.some(ta =>
        datasConflitam(t.data_inicio, t.data_fim, ta.data_inicio, ta.data_fim)
      );
    });

    const payload = {
      tenant_id: tenant,
      aluno_id:  alunoId,
      curso_id:  cursoId,
      status:    turmaDisponivel ? 'matriculado' : 'aguardando_turma',
      turma_id:  turmaDisponivel ? turmaDisponivel.id : null,
    };

    const { error } = await supabase.from('matriculas').insert(payload);
    if (error) throw error;

    return { ok: true, turma_code: turmaDisponivel?.codigo ?? null };
  } catch (err) {
    console.warn('[Automations] criarMatriculaAutomatica falhou:', err.message);
    return { ok: false, reason: err.message };
  }
}
