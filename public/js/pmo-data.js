// js/pmo-data.js
// Camada de dados do PMO. Tudo passa por aqui — render só lê do state local.
// Falhas silenciosas pra tabelas confidenciais (client recebe 401/[] e seguimos).

window.pmoData = (function () {
  const debouncers = new Map();
  function debounce(key, ms, fn) {
    clearTimeout(debouncers.get(key));
    debouncers.set(key, setTimeout(fn, ms));
  }

  // ------------------------------------------------------------
  // LOAD — busca tudo do projeto em paralelo.
  // Retorna o state compatível com a estrutura do painel original.
  // ------------------------------------------------------------
  async function loadProject(projectId) {
    const sb = window.sb;

    // safe: nunca rejeita; sempre devolve {data, error}.
    const safe = (q) => q.then(
      r => (r && r.error) ? { data: r.data ?? null, error: r.error } : r,
      err => ({ data: null, error: err })
    );

    const [
      projectRes, phasesRes, delivsRes, subsRes,
      closersRes, actionsRes, financeRes, notesRes, stateRes
    ] = await Promise.all([
      safe(sb.from('projects').select('*').eq('id', projectId).single()),
      safe(sb.from('phases').select('*').eq('project_id', projectId).order('sort')),
      safe(sb.from('deliverables').select('*').eq('project_id', projectId).order('sort')),
      // subtasks: filtra via inner-join no project_id do deliverable
      safe(sb.from('subtasks').select('*, deliverables!inner(project_id)').eq('deliverables.project_id', projectId).order('sort')),
      safe(sb.from('closers').select('*').eq('project_id', projectId).order('sort')),
      safe(sb.from('actions').select('*').eq('project_id', projectId).order('sort')),
      safe(sb.from('finance').select('*').eq('project_id', projectId).maybeSingle()),
      safe(sb.from('notes').select('*').eq('project_id', projectId).maybeSingle()),
      safe(sb.from('project_state').select('*').eq('project_id', projectId).maybeSingle()),
    ]);

    // Loga cada resultado pra ficar fácil debugar quando algo vier vazio
    console.log('[pmo-data] load', {
      project:       projectRes.error  ? `ERR ${projectRes.error.message}`  : !!projectRes.data,
      phases:        phasesRes.error   ? `ERR ${phasesRes.error.message}`   : (phasesRes.data?.length ?? 0),
      deliverables:  delivsRes.error   ? `ERR ${delivsRes.error.message}`   : (delivsRes.data?.length ?? 0),
      subtasks:      subsRes.error     ? `ERR ${subsRes.error.message}`     : (subsRes.data?.length ?? 0),
      closers:       closersRes.error  ? `ERR ${closersRes.error.message}`  : (closersRes.data?.length ?? 0),
      actions:       actionsRes.error  ? `ERR ${actionsRes.error.message}`  : (actionsRes.data?.length ?? 0),
      finance:       financeRes.error  ? `ERR ${financeRes.error.message}`  : !!financeRes.data,
      notes:         notesRes.error    ? `ERR ${notesRes.error.message}`    : !!notesRes.data,
      project_state: stateRes.error    ? `ERR ${stateRes.error.message}`    : !!stateRes.data,
    });

    if (!projectRes.data) {
      throw new Error('Projeto não encontrado ou sem acesso: ' + (projectRes.error?.message || 'unknown'));
    }
    const project = projectRes.data;

    // Junta subtasks dentro de cada deliverable.
    const deliverables = (delivsRes.data || []).map(d => ({
      ...d,
      subtasks: (subsRes.data || [])
        .filter(s => s.deliverable_id === d.id)
        .sort((a, b) => a.sort - b.sort),
    }));

    return {
      project,
      phases:      phasesRes.data || [],
      deliverables,
      closers:     closersRes.data || [],
      actions:     actionsRes.data || [],
      finance:     financeRes.data || null,
      notes:       notesRes.data || null,
      projectState: stateRes.data || null,
    };
  }

  // ------------------------------------------------------------
  // DAY / WEEK helpers (derivados de start_date)
  // ------------------------------------------------------------
  // Dias úteis decorridos (seg-sex), capped em total_days.
  function dayIndex(project) {
    if (!project || !project.start_date) return 0;
    const start = new Date(project.start_date + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (today < start) return 0;
    let days = 0;
    const cursor = new Date(start);
    while (cursor <= today) {
      const dow = cursor.getDay(); // 0=Sun, 6=Sat
      if (dow !== 0 && dow !== 6) days++;
      cursor.setDate(cursor.getDate() + 1);
    }
    return Math.min(days, project.total_days || 60);
  }

  // ------------------------------------------------------------
  // SAVES (debounced) — uma função por entidade.
  // Se RLS bloqueia, o erro é logado mas não derruba a UI.
  // ------------------------------------------------------------
  function logErr(scope, err) {
    if (err) console.warn('[pmo-data]', scope, err.message || err);
  }

  function saveDeliverable(d) {
    debounce('deliv:' + d.id, 400, async () => {
      const { error } = await window.sb.from('deliverables').update({
        title: d.title, description: d.description, tag: d.tag, tag_label: d.tag_label,
        start_week: d.start_week, end_week: d.end_week, sort: d.sort,
      }).eq('id', d.id);
      logErr('saveDeliverable', error);
    });
  }

  async function toggleSubtaskDone(subtaskId, done) {
    const { error } = await window.sb.from('subtasks').update({ done }).eq('id', subtaskId);
    logErr('toggleSubtaskDone', error);
  }

  async function createSubtask(deliverableId, text, sort) {
    const { data, error } = await window.sb.from('subtasks')
      .insert({ deliverable_id: deliverableId, text, sort, done: false })
      .select().single();
    logErr('createSubtask', error);
    return data;
  }

  function updateSubtaskText(id, text) {
    debounce('subtxt:' + id, 400, async () => {
      const { error } = await window.sb.from('subtasks').update({ text }).eq('id', id);
      logErr('updateSubtaskText', error);
    });
  }

  async function deleteSubtask(id) {
    const { error } = await window.sb.from('subtasks').delete().eq('id', id);
    logErr('deleteSubtask', error);
  }

  async function updatePhaseStatus(id, status) {
    const { error } = await window.sb.from('phases').update({ status }).eq('id', id);
    logErr('updatePhaseStatus', error);
  }

  function saveCloser(c) {
    debounce('closer:' + c.id, 400, async () => {
      const { error } = await window.sb.from('closers').update({
        name: c.name, role: c.role, initials: c.initials,
        sessions: c.sessions, conv: c.conv, ticket: c.ticket,
      }).eq('id', c.id);
      logErr('saveCloser', error);
    });
  }

  async function updateCloserSessions(id, sessions) {
    const { error } = await window.sb.from('closers').update({ sessions }).eq('id', id);
    logErr('updateCloserSessions', error);
  }

  function saveAction(a) {
    debounce('action:' + a.id, 400, async () => {
      const { error } = await window.sb.from('actions').update({
        text: a.text, meta: a.meta, done: a.done, sort: a.sort,
      }).eq('id', a.id);
      logErr('saveAction', error);
    });
  }

  async function toggleAction(id, done) {
    const { error } = await window.sb.from('actions').update({ done }).eq('id', id);
    logErr('toggleAction', error);
  }

  async function createAction(projectId, text, meta, sort) {
    const { data, error } = await window.sb.from('actions')
      .insert({ project_id: projectId, text, meta, sort, done: false })
      .select().single();
    logErr('createAction', error);
    return data;
  }

  async function deleteAction(id) {
    const { error } = await window.sb.from('actions').delete().eq('id', id);
    logErr('deleteAction', error);
  }

  function saveFinance(projectId, patch) {
    debounce('fin:' + projectId, 400, async () => {
      const { error } = await window.sb.from('finance').upsert({
        project_id: projectId, ...patch,
      }, { onConflict: 'project_id' });
      logErr('saveFinance', error);
    });
  }

  function saveNotes(projectId, content) {
    debounce('notes:' + projectId, 400, async () => {
      const { error } = await window.sb.from('notes').upsert({
        project_id: projectId, content,
      }, { onConflict: 'project_id' });
      logErr('saveNotes', error);
    });
  }

  function touchState(projectId) {
    debounce('state:' + projectId, 600, async () => {
      const { error } = await window.sb.from('project_state').upsert({
        project_id: projectId, updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id' });
      logErr('touchState', error);
    });
  }

  // ------------------------------------------------------------
  // REALTIME — chama onChange(payload) em qualquer mudança no projeto.
  // ------------------------------------------------------------
  function subscribeProject(projectId, onChange) {
    const ch = window.sb.channel('pmo:' + projectId);
    const tables = ['phases', 'deliverables', 'subtasks', 'closers', 'actions',
                    'finance', 'notes', 'project_state'];
    tables.forEach(t => {
      const filter = (t === 'subtasks')
        ? undefined  // subtasks não tem project_id direto; filtramos no callback
        : `project_id=eq.${projectId}`;
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table: t, filter },
        (payload) => onChange(t, payload));
    });
    ch.subscribe();
    return () => window.sb.removeChannel(ch);
  }

  return {
    loadProject, dayIndex,
    saveDeliverable, toggleSubtaskDone, createSubtask, updateSubtaskText, deleteSubtask,
    updatePhaseStatus,
    saveCloser, updateCloserSessions,
    saveAction, toggleAction, createAction, deleteAction,
    saveFinance, saveNotes, touchState,
    subscribeProject,
  };
})();
