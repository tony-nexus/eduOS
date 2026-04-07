/**
 * /js/views/matriculas.js
 * CRUD real para Matrículas.
 *
 * CORREÇÕES APLICADAS:
 *  - Corrigido campo 'inicio' → 'data_inicio' na query de turmas (Bug #3)
 *  - Filtro de turmas por curso no modal (só exibe turmas do curso selecionado)
 *  - XSS escape em interpolações HTML
 *  - Validação de aluno duplicado na mesma turma (guard client-side)
 *  - [FIX CRÍTICO] Incremento/decremento real de turmas.ocupadas ao matricular/cancelar
 */

import { supabase, getTenantId } from '../core/supabase.js';
import { setContent, openModal, closeModal, toast, fmtDate, esc } from '../ui/components.js';

let _matriculas = [];
let _alunos     = [];
let _cursos     = [];
let _turmas     = [];

const BADGE_MAP = { matriculado:'badge-blue', aguardando_turma:'badge-amber', em_andamento:'badge-accent', concluido:'badge-green', certificado_emitido:'badge-purple', cancelado:'badge-red', reprovado:'badge-red' };
const LABEL_MAP = { matriculado:'Matriculado', aguardando_turma:'Ag. Turma', em_andamento:'Em Andamento', concluido:'Concluído', certificado_emitido:'Cert. Emitido', cancelado:'Cancelado', reprovado:'Reprovado' };

export async function render() {
  setContent(`
    <div class="page-header">
      <div><h1>Matrículas</h1><p>Registro e gestão de matrículas</p></div>
      <div class="page-header-actions">
        <button class="btn btn-primary" id="btn-nova-mat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nova Matrícula
        </button>
      </div>
    </div>
    <div class="stats-row" id="mats-kpis">
      ${Array(4).fill('<div class="stat-card"><div class="skeleton" style="height:40px;width:100%"></div></div>').join('')}
    </div>
    <div class="table-wrap">
      <div class="table-toolbar">
        <div class="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="search-input" id="search-mats" placeholder="Aluno ou turma...">
        </div>
        <select class="select-input" id="filtro-status-mat">
          <option value="">Todos os status</option>
          <option value="matriculado">Matriculado</option>
          <option value="aguardando_turma">Aguardando Turma</option>
          <option value="em_andamento">Em Andamento</option>
          <option value="concluido">Concluído</option>
          <option value="certificado_emitido">Certificado Emitido</option>
          <option value="cancelado">Cancelado</option>
          <option value="reprovado">Reprovado</option>
        </select>
      </div>
      <div style="overflow-x:auto">
        <table>
          <thead><tr>
            <th>Aluno</th><th>Curso</th><th>Turma</th>
            <th>Data Matrícula</th><th>Status</th><th>Ações</th>
          </tr></thead>
          <tbody id="mats-tbody">
            <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-tertiary)">
              Carregando...
            </td></tr>
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        <span class="table-info" id="mats-count">—</span>
      </div>
    </div>
  `);

  document.getElementById('btn-nova-mat')?.addEventListener('click', () => modalNovaMatricula());
  document.getElementById('search-mats')?.addEventListener('input', applyFilter);
  document.getElementById('filtro-status-mat')?.addEventListener('change', applyFilter);

  await Promise.all([loadMatriculas(), loadAux()]);
}

// ─── Fetches ──────────────────────────────────────────────────────────────────
async function loadAux() {
  try {
    const [r1, r2, r3] = await Promise.all([
      supabase.from('alunos').select('id, nome').eq('tenant_id', getTenantId()).eq('status', 'ativo').order('nome'),
      supabase.from('cursos').select('id, nome, valor_padrao').eq('tenant_id', getTenantId()).eq('ativo', true).order('nome'),
      // CORREÇÃO BUG #3: campo correto é 'data_inicio', não 'inicio'
      supabase.from('turmas').select('id, codigo, curso_id, vagas, ocupadas, status')
        .eq('tenant_id', getTenantId())
        .in('status', ['agendada', 'em_andamento'])
        .order('data_inicio', { ascending: false }),
    ]);
    _alunos = r1.data || [];
    _cursos = r2.data || [];
    _turmas = r3.data || [];
  } catch (err) {
    console.error('[Matrículas] loadAux:', err);
  }
}

async function loadMatriculas() {
  try {
    const { data, error } = await supabase
      .from('matriculas')
      .select('*, aluno:aluno_id(nome), curso:curso_id(nome), turma:turma_id(codigo)')
      .eq('tenant_id', getTenantId())
      .order('created_at', { ascending: false });

    if (error) throw error;
    _matriculas = (data || []).map(m => ({
      ...m,
      aluno_nome:   m.aluno?.nome   || '—',
      curso_nome:   m.curso?.nome   || '—',
      turma_codigo: m.turma?.codigo || '—',
    }));
  } catch (err) {
    console.error(err);
    toast('Erro ao carregar matrículas', 'error');
    _matriculas = [];
  }
  renderKPIs(_matriculas);
  applyFilter();
}

// ─── KPIs ─────────────────────────────────────────────────────────────────────
function renderKPIs(mats) {
  const em  = mats.filter(m => m.status === 'em_andamento').length;
  const con = mats.filter(m => m.status === 'concluido' || m.status === 'certificado_emitido').length;
  const ag  = mats.filter(m => m.status === 'aguardando_turma').length;
  const el  = document.getElementById('mats-kpis');
  if (!el) return;
  el.innerHTML = `
    <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value" style="color:var(--text-primary)">${mats.length}</div></div>
    <div class="stat-card"><div class="stat-label">Em Andamento</div><div class="stat-value" style="color:var(--accent)">${em}</div></div>
    <div class="stat-card"><div class="stat-label">Concluídas</div><div class="stat-value" style="color:var(--green)">${con}</div></div>
    <div class="stat-card"><div class="stat-label">Ag. Turma</div><div class="stat-value" style="color:var(--amber)">${ag}</div></div>
  `;
}

// ─── Filtro ───────────────────────────────────────────────────────────────────
function applyFilter() {
  const q  = (document.getElementById('search-mats')?.value || '').toLowerCase();
  const st = document.getElementById('filtro-status-mat')?.value || '';
  const f  = _matriculas.filter(m =>
    (!q  || m.aluno_nome.toLowerCase().includes(q) || m.turma_codigo.toLowerCase().includes(q) || m.curso_nome.toLowerCase().includes(q)) &&
    (!st || m.status === st)
  );
  const tbody = document.getElementById('mats-tbody');
  const count = document.getElementById('mats-count');
  if (!tbody) return;

  if (!f.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-tertiary)">Nenhuma matrícula encontrada.</td></tr>`;
    if (count) count.textContent = '0 registros';
    return;
  }

  tbody.innerHTML = f.map(m => `
    <tr>
      <td style="font-weight:500">${esc(m.aluno_nome)}</td>
      <td style="font-size:12.5px;color:var(--text-secondary)">${esc(m.curso_nome)}</td>
      <td><span style="font-family:var(--font-mono);font-size:12px;color:var(--text-tertiary)">${esc(m.turma_codigo)}</span></td>
      <td style="font-size:12px;color:var(--text-tertiary)">${fmtDate(m.created_at)}</td>
      <td><span class="badge ${BADGE_MAP[m.status] ?? 'badge-gray'}">${LABEL_MAP[m.status] ?? m.status}</span></td>
      <td>
        <button class="action-btn action-editar" data-id="${m.id}">Editar Status</button>
      </td>
    </tr>
  `).join('');

  if (count) count.textContent = `${f.length} registro${f.length !== 1 ? 's' : ''}`;

  document.querySelectorAll('.action-editar').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = _matriculas.find(x => x.id === btn.dataset.id);
      if (m) modalEditar(m);
    });
  });
}

// ─── Modal Nova Matrícula ─────────────────────────────────────────────────────
function modalNovaMatricula() {
  const aluOpts = _alunos.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('');
  const curOpts = _cursos.map(c =>
    `<option value="${c.id}" data-valor="${c.valor_padrao || 0}">${esc(c.nome)}</option>`
  ).join('');

  openModal('Nova Matrícula', `
    <div class="form-grid">
      <div class="form-group full">
        <label>Aluno *</label>
        <select id="f-aluno">
          <option value="">— Selecionar aluno —</option>
          ${aluOpts}
        </select>
      </div>
      <div class="form-group full">
        <label>Curso *</label>
        <select id="f-curso">
          <option value="">— Selecionar curso —</option>
          ${curOpts}
        </select>
      </div>
      <div class="form-group full">
        <label>Turma (opcional)</label>
        <select id="f-turma">
          <option value="">— Sem turma / Aguardando —</option>
        </select>
        <small style="color:var(--text-tertiary);font-size:11px">Apenas turmas abertas do curso selecionado.</small>
      </div>
      <div class="form-group">
        <label>Valor Cobrado (R$)</label>
        <input id="f-valor" type="number" step="0.01" placeholder="0,00">
      </div>
      <div class="form-group">
        <label>Status Inicial</label>
        <select id="f-status">
          <option value="matriculado">Matriculado</option>
          <option value="aguardando_turma">Aguardando Turma</option>
          <option value="em_andamento">Em Andamento</option>
        </select>
      </div>
      <div class="form-group full">
        <label>Observações</label>
        <textarea id="f-obs" placeholder="Informações adicionais..."></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-save">Salvar Matrícula</button>
    </div>
  `);

  // Atualiza lista de turmas ao trocar curso + preenche valor padrão
  document.getElementById('f-curso')?.addEventListener('change', function() {
    const cursoId = this.value;
    const valorPadrao = this.options[this.selectedIndex]?.dataset.valor || '';
    document.getElementById('f-valor').value = valorPadrao;

    const turmaSelect = document.getElementById('f-turma');
    const turmasFiltradas = _turmas.filter(t => t.curso_id === cursoId);
    turmaSelect.innerHTML = '<option value="">— Sem turma / Aguardando —</option>' +
      turmasFiltradas.map(t => {
        const disponivel = (t.vagas || 0) - (t.ocupadas || 0);
        const label = `${t.codigo} (${disponivel} vaga${disponivel !== 1 ? 's' : ''})`;
        return `<option value="${t.id}" ${disponivel <= 0 ? 'disabled' : ''}>${esc(label)}</option>`;
      }).join('');

    // Auto-seleciona status
    const st = document.getElementById('f-status');
    if (turmasFiltradas.length === 0 && st) st.value = 'aguardando_turma';
  });

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-save')?.addEventListener('click', () => saveMatricula());
}

// ─── Save ─────────────────────────────────────────────────────────────────────
async function saveMatricula() {
  const aluno_id = document.getElementById('f-aluno')?.value;
  const curso_id = document.getElementById('f-curso')?.value;
  const turma_id = document.getElementById('f-turma')?.value || null;
  const valor    = parseFloat(document.getElementById('f-valor')?.value) || null;
  const status   = document.getElementById('f-status')?.value;
  let obs        = document.getElementById('f-obs')?.value.trim() || null;

  if (!aluno_id) { toast('Selecione um aluno.', 'warning'); return; }
  if (!curso_id) { toast('Selecione um curso.', 'warning'); return; }

  // Guard client-side: verifica se o aluno já está matriculado nesta turma
  if (turma_id) {
    const duplicado = _matriculas.find(m =>
      m.aluno_id === aluno_id && m.turma_id === turma_id && m.status !== 'cancelado'
    );
    if (duplicado) {
      toast('Este aluno já está matriculado nesta turma.', 'warning');
      return;
    }
  }

  const btn = document.getElementById('modal-save');
  btn.disabled = true;
  btn.textContent = 'Verificando Inteligência...';

  // --- INTELIGÊNCIA DE MATRÍCULAS ---
  try {
    const { data: auth, error: rpcErr } = await supabase.rpc('autorizar_matricula', {
      p_aluno_id: aluno_id,
      p_curso_id: curso_id
    });
    if (rpcErr) throw rpcErr;
    if (auth && !auth.autorizado) {
      toast(auth.motivo || 'Matrícula bloqueada pela regras de negócio.', 'warning');
      btn.disabled = false;
      btn.textContent = 'Salvar Matrícula';
      return;
    }
    if (auth && auth.tipo_matricula && auth.tipo_matricula !== 'Nova Matrícula') {
      obs = obs ? `${obs}\n\n[Tipo: ${auth.tipo_matricula}]` : `[Tipo: ${auth.tipo_matricula}]`;
      toast(`Classificada como: ${auth.tipo_matricula}`, 'info');
    }
  } catch(e) {
    console.warn("RPC autorizar_matricula falhou. Prosseguindo fallback.", e);
  }

  btn.textContent = 'Salvando...';

  try {
    const { data: novaMat, error } = await supabase.from('matriculas').insert({
      tenant_id: getTenantId(),
      aluno_id, curso_id, turma_id, status,
      observacoes: obs,
    }).select('id').single();
    if (error) {
      if (error.code === '23505') throw new Error('Matrícula duplicada para este aluno nesta turma.');
      throw error;
    }

    // A trigger do banco (fn_sync_turma_ocupadas) já incrementa a ocupada do BD.
    // O frontend não deve fazer manualmente para não causar salto duplo (ex: 1/20 virar 2/20 no visual)

    // Registra pagamento inicial se informado valor
    if (valor && valor > 0 && novaMat?.id) {
      await supabase.from('pagamentos').insert({
        tenant_id: getTenantId(),
        matricula_id: novaMat.id,
        aluno_id,
        curso_id,
        valor,
        data_vencimento: new Date().toISOString().split('T')[0],
        status: 'pendente',
      });
    }

    closeModal();
    toast('Matrícula registrada com sucesso!', 'success');
    await loadMatriculas();
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Salvar Matrícula';
  }
}

// ─── Atualização de Vagas via BD Automático ─────────────────────────────────
// A função adjustOcupadas nativa do frontend foi removida, pois a base de dados
// usa a trigger fn_sync_turma_ocupadas() para garantir ACID em incrementos.

// ─── Modal Editar Status ──────────────────────────────────────────────────────
function modalEditar(m) {
  openModal(`Atualizar — ${esc(m.aluno_nome)}`, `
    <div style="margin-bottom:16px;padding:12px;background:var(--bg-elevated);border-radius:8px;font-size:13px;color:var(--text-secondary)">
      <strong style="color:var(--text-primary)">${esc(m.aluno_nome)}</strong><br>
      ${esc(m.curso_nome)} · Turma <span style="font-family:var(--font-mono)">${esc(m.turma_codigo)}</span>
    </div>
    <div class="form-group">
      <label>Novo Status</label>
      <select id="e-status">
        ${Object.entries(LABEL_MAP).map(([v, l]) =>
          `<option value="${v}" ${m.status === v ? 'selected' : ''}>${l}</option>`
        ).join('')}
      </select>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">Cancelar</button>
      <button class="btn btn-primary" id="modal-update">Salvar Status</button>
    </div>
  `);

  document.getElementById('modal-cancel')?.addEventListener('click', () => closeModal());
  document.getElementById('modal-update')?.addEventListener('click', async () => {
    const st      = document.getElementById('e-status')?.value;
    const oldSt   = m.status;
    const btn     = document.getElementById('modal-update');
    btn.disabled  = true;
    try {
      const { error } = await supabase
        .from('matriculas').update({ status: st }).eq('id', m.id).eq('tenant_id', getTenantId());
      if (error) throw error;

      // O banco de dados ajusta as vagas ocupadas automaticamente via Trigger
      // quando o status muda para "cancelado" ou retorna.

      closeModal();
      toast('Status atualizado!', 'success');
      await loadMatriculas();
    } catch (err) {
      toast('Erro ao atualizar.', 'error');
      btn.disabled = false;
    }
  });
}
