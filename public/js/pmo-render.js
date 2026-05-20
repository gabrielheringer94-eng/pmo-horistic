// js/pmo-render.js
// Renderers do painel. Lê de window.pmoState; escreve via window.pmoData.
// Espera que pmoState tenha: project, role, phases, deliverables (com subtasks),
// closers, actions, finance, notes.

window.pmoRender = (function () {
  const TOTAL_WEEKS = 12;
  let state = null;
  let projectId = null;

  function isAdmin() { return state && state.role === 'admin'; }

  function setState(newState) {
    state = newState;
    projectId = newState.project.id;
    document.body.dataset.role = newState.role;
    renderAll();
  }

  // Aplica patch parcial vindo do Realtime sem perder ordem local.
  function applyRealtime(table, payload) {
    if (!state) return;
    const row = payload.new || payload.old;
    if (!row) return;

    const upsertById = (list, item) => {
      const i = list.findIndex(x => x.id === item.id);
      if (i >= 0) list[i] = { ...list[i], ...item };
      else list.push(item);
    };
    const removeById = (list, id) => {
      const i = list.findIndex(x => x.id === id);
      if (i >= 0) list.splice(i, 1);
    };

    if (table === 'phases') {
      if (payload.eventType === 'DELETE') removeById(state.phases, row.id);
      else upsertById(state.phases, payload.new);
      state.phases.sort((a, b) => a.sort - b.sort);
    } else if (table === 'deliverables') {
      if (payload.eventType === 'DELETE') removeById(state.deliverables, row.id);
      else {
        const existing = state.deliverables.find(d => d.id === payload.new.id);
        upsertById(state.deliverables, { ...payload.new, subtasks: existing ? existing.subtasks : [] });
      }
      state.deliverables.sort((a, b) => a.sort - b.sort);
    } else if (table === 'subtasks') {
      const d = state.deliverables.find(d => d.id === (payload.new || payload.old).deliverable_id);
      if (!d) return;
      d.subtasks = d.subtasks || [];
      if (payload.eventType === 'DELETE') removeById(d.subtasks, row.id);
      else upsertById(d.subtasks, payload.new);
      d.subtasks.sort((a, b) => a.sort - b.sort);
    } else if (table === 'closers') {
      if (payload.eventType === 'DELETE') removeById(state.closers, row.id);
      else upsertById(state.closers, payload.new);
      state.closers.sort((a, b) => a.sort - b.sort);
    } else if (table === 'actions') {
      if (payload.eventType === 'DELETE') removeById(state.actions, row.id);
      else upsertById(state.actions, payload.new);
      state.actions.sort((a, b) => a.sort - b.sort);
    } else if (table === 'finance') {
      state.finance = payload.new || state.finance;
    } else if (table === 'notes') {
      const newNotes = payload.new;
      if (newNotes && (!state.notes || newNotes.updated_at >= state.notes.updated_at)) {
        state.notes = newNotes;
      }
    }
    renderAll();
  }

  // ---------- helpers ----------
  function dayIndex() { return window.pmoData.dayIndex(state.project); }
  function totalDays() { return state.project.total_days || 60; }
  function currentWeek() {
    const di = dayIndex();
    if (di <= 0) return 1;
    return Math.min(TOTAL_WEEKS, Math.floor((di - 1) / 5) + 1);
  }
  function deliverableProgress(d) {
    const subs = d.subtasks || [];
    if (!subs.length) return d.progress || 0;
    return Math.round((subs.filter(s => s.done).length / subs.length) * 100);
  }
  function overallProgress() {
    if (!state.deliverables.length) return 0;
    return state.deliverables.reduce((s, d) => s + deliverableProgress(d), 0) / state.deliverables.length;
  }
  function moneyBR(v) { return 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR'); }
  function fmtDateBR(d) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function showSaved() {
    const el = document.getElementById('savedIndicator');
    if (!el) return;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 1200);
  }

  // ---------- topbar / header ----------
  function renderTopbar() {
    const ticks = document.querySelector('.topbar .ticks');
    if (ticks) {
      ticks.innerHTML = state.phases.map(p =>
        `<span class="tick ${p.status === 'active' || p.status === 'done' ? 'active' : ''}"></span>`
      ).join('');
    }
    const today = document.getElementById('todayStr');
    if (today) today.textContent = fmtDateBR(new Date());
    const orgEl = document.getElementById('topbarOrg');
    if (orgEl) orgEl.textContent = (state.project.name || 'PMO');
  }

  function renderHeader() {
    const di = dayIndex();
    const td = totalDays();
    const cd = document.getElementById('cycleDay');
    if (cd) cd.childNodes[0].nodeValue = `Dia ${di} / ${td}`;

    const start = new Date(state.project.start_date + 'T00:00:00');
    const end = new Date(start); end.setDate(end.getDate() + Math.round(td * 1.4)); // ~aprox fim incluindo finais de semana
    const dates = document.getElementById('cycleDates');
    if (dates) dates.textContent = `${fmtDateBR(start)} → ${fmtDateBR(end)}`;

    const active = state.phases.find(p => p.status === 'active') || state.phases[state.phases.length - 1];
    if (active) {
      document.getElementById('activePhaseName').childNodes[0].nodeValue = active.name;
      document.getElementById('activePhaseRange').textContent = active.range_label || '';
    }
  }

  // ---------- KPIs ----------
  function renderKPIs() {
    const di = dayIndex();
    const td = totalDays();
    const total = overallProgress();
    const completed = state.deliverables.filter(d => deliverableProgress(d) >= 100).length;
    const activePhase = state.phases.find(p => p.status === 'active');
    const daysLeft = Math.max(0, td - di);

    const kpis = [];
    kpis.push({
      label: 'Progresso geral',
      value: Math.round(total) + '%',
      pill: di === 0 ? 'Pré-kickoff' : `Dia ${di}`,
      trend: `${completed} de ${state.deliverables.length} entregas`,
    });
    kpis.push({
      label: 'Entregas concluídas',
      value: `${completed}/${state.deliverables.length}`,
      pill: completed === state.deliverables.length ? 'Done'
            : (total >= (di / td) * 100 ? 'On track' : 'Atenção'),
      trend: activePhase ? `Fase atual: ${activePhase.name}` : 'Ciclo finalizado',
    });

    if (isAdmin() && state.finance) {
      const fixo = Number(state.finance.fixo_total || 0);
      const pct = Number(state.finance.pct_variavel || 0);
      kpis.push({
        label: 'Honorário do ciclo',
        value: moneyBR(fixo),
        pill: 'Fixo',
        trend: `+ ${pct}% variável s/ vendas`,
      });
    }
    kpis.push({
      label: 'Dias restantes',
      value: String(daysLeft),
      pill: daysLeft > 30 ? 'Início' : daysLeft > 10 ? 'Meio' : daysLeft > 0 ? 'Reta final' : 'Done',
      trend: daysLeft === td ? `Ciclo de ${td} dias úteis`
             : (daysLeft === 0 ? 'Ciclo encerrado' : `de ${td} dias úteis`),
    });

    const grid = document.getElementById('kpiGrid');
    grid.innerHTML = kpis.map(k => {
      const pillClass = k.pill === 'Done' ? 'success' : (k.pill === 'Atenção' ? 'warning' : '');
      return `
        <div class="kpi">
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value">${k.value}</div>
          <div class="kpi-trend">
            <span class="pill ${pillClass}">${k.pill}</span>
            <span>${k.trend}</span>
          </div>
        </div>`;
    }).join('');

    document.getElementById('overallPct').textContent = Math.round(total) + '%';
    document.getElementById('overallBar').style.width = total + '%';
    document.getElementById('overallToday').style.left = ((di / td) * 100) + '%';
  }

  // ---------- Gantt ----------
  function renderGantt() {
    const weeks = document.getElementById('ganttWeeks');
    const cur = currentWeek();
    const di = dayIndex();
    weeks.innerHTML = Array.from({ length: TOTAL_WEEKS }, (_, i) => {
      const w = i + 1;
      return `<div class="gantt-week ${w === cur && di > 0 ? 'current' : ''}">S${w}</div>`;
    }).join('');

    const grid = document.getElementById('ganttGrid');
    const todayPct = (di / totalDays()) * 100;
    grid.innerHTML = state.deliverables.map(d => {
      const startCol = d.start_week;
      const endCol = d.end_week;
      const leftPct = ((startCol - 1) / TOTAL_WEEKS) * 100;
      const widthPct = ((endCol - startCol + 1) / TOTAL_WEEKS) * 100;
      const pct = deliverableProgress(d);
      return `
        <div class="gantt-row-label">
          <div class="num">#${String(d.num).padStart(2, '0')} · ${d.tag_label}</div>
          <div class="name">${escapeHtml(d.title)}</div>
        </div>
        <div class="gantt-row-track">
          <div class="gantt-bar ${d.tag}" style="position:absolute; left:${leftPct}%; width:${widthPct}%; top:50%; transform: translateY(-50%);" title="${escapeHtml(d.title)} · ${pct}%">
            <div class="gantt-bar-fill" style="width:${pct}%;"></div>
            <span class="gantt-bar-pct">${pct}%</span>
          </div>
          ${di > 0 ? `<div class="gantt-today-line" style="left:${todayPct}%;"></div>` : ''}
        </div>`;
    }).join('');
  }

  function renderPhases() {
    const container = document.getElementById('phasesContainer');
    container.innerHTML = state.phases.map(p => {
      const statusLabel = p.status === 'done' ? 'Concluída' : p.status === 'active' ? 'Em andamento' : 'A fazer';
      const days = (p.end_week - p.start_week + 1) * 5;
      const click = isAdmin() ? `onclick="pmoRender.cyclePhase('${p.id}')"` : '';
      const title = isAdmin() ? 'title="Clique para mudar status"' : '';
      return `
        <div class="phase ${p.status}" ${click} ${title}>
          <div class="phase-num">Fase ${String(p.num).padStart(2, '0')}</div>
          <div class="phase-name">${escapeHtml(p.name)}</div>
          <div class="phase-range">${p.range_label} · ${days} dias</div>
          <span class="phase-status ${p.status}">${statusLabel}</span>
        </div>`;
    }).join('');
  }

  async function cyclePhase(id) {
    if (!isAdmin()) return;
    const p = state.phases.find(x => x.id === id);
    if (!p) return;
    const order = ['todo', 'active', 'done'];
    p.status = order[(order.indexOf(p.status) + 1) % 3];
    renderPhases(); renderTopbar(); renderKPIs(); renderHeader();
    await window.pmoData.updatePhaseStatus(id, p.status);
    window.pmoData.touchState(projectId);
    showSaved();
  }

  // ---------- Entregáveis + subtasks ----------
  function renderDeliverables() {
    const grid = document.getElementById('deliverablesGrid');
    grid.innerHTML = state.deliverables.map(d => {
      const pct = deliverableProgress(d);
      const subs = d.subtasks || [];
      const doneCount = subs.filter(s => s.done).length;
      const editable = isAdmin() ? 'contenteditable="true"' : '';
      const subsHtml = subs.map(s => `
        <li class="sub ${s.done ? 'done' : ''}" onclick="pmoRender.toggleSubtask('${s.id}')">
          <span class="sub-check"></span>
          <span class="sub-text" ${editable} onclick="event.stopPropagation()" data-sub="${s.id}">${escapeHtml(s.text)}</span>
          ${isAdmin() ? `<span class="sub-del" onclick="event.stopPropagation(); pmoRender.deleteSubtask('${s.id}')" title="Remover">×</span>` : ''}
        </li>`).join('');
      const addBtn = isAdmin()
        ? `<button class="add-sub" onclick="pmoRender.addSubtask('${d.id}')">+ subtarefa</button>` : '';
      return `
        <div class="deliverable">
          <div class="deliverable-head">
            <span class="deliverable-tag tag-${d.tag}">${d.tag_label}</span>
            <span class="deliverable-num">#${String(d.num).padStart(2, '0')}</span>
          </div>
          <div class="deliverable-title">${escapeHtml(d.title)}</div>
          <div class="deliverable-desc">${escapeHtml(d.description || '')}</div>
          <div class="progress-row">
            <span class="progress-label">${doneCount}/${subs.length} subtarefas</span>
            <span class="progress-val">${pct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${pct >= 100 ? 'done' : ''}" style="width:${pct}%;"></div>
          </div>
          <ul class="sub-list">${subsHtml}</ul>
          ${addBtn}
        </div>`;
    }).join('');

    if (isAdmin()) {
      grid.querySelectorAll('[data-sub]').forEach(el => {
        el.addEventListener('blur', () => {
          const id = el.dataset.sub;
          const text = el.innerText.trim();
          // local update
          for (const d of state.deliverables) {
            const s = (d.subtasks || []).find(s => s.id === id);
            if (s) { s.text = text; break; }
          }
          window.pmoData.updateSubtaskText(id, text);
          showSaved();
        });
      });
    }
  }

  async function toggleSubtask(id) {
    let target = null, parent = null;
    for (const d of state.deliverables) {
      const s = (d.subtasks || []).find(s => s.id === id);
      if (s) { target = s; parent = d; break; }
    }
    if (!target) return;
    target.done = !target.done;
    renderDeliverables(); renderGantt(); renderKPIs();
    await window.pmoData.toggleSubtaskDone(id, target.done);
    window.pmoData.touchState(projectId);
    showSaved();
  }

  async function addSubtask(deliverableId) {
    if (!isAdmin()) return;
    const d = state.deliverables.find(x => x.id === deliverableId);
    if (!d) return;
    const sort = (d.subtasks || []).reduce((m, s) => Math.max(m, s.sort), 0) + 1;
    const created = await window.pmoData.createSubtask(deliverableId, 'Nova subtarefa — clique para editar', sort);
    if (created) {
      d.subtasks = (d.subtasks || []).concat(created);
      renderDeliverables(); renderGantt(); renderKPIs();
      showSaved();
    }
  }

  async function deleteSubtask(id) {
    if (!isAdmin()) return;
    for (const d of state.deliverables) {
      const i = (d.subtasks || []).findIndex(s => s.id === id);
      if (i >= 0) { d.subtasks.splice(i, 1); break; }
    }
    renderDeliverables(); renderGantt(); renderKPIs();
    await window.pmoData.deleteSubtask(id);
    showSaved();
  }

  // ---------- Closers ----------
  function renderClosers() {
    if (!isAdmin()) return;
    const container = document.getElementById('rosterContainer');
    if (!container) return;
    const TOTAL_SESSIONS = 8;
    container.innerHTML = state.closers.map(c => {
      const dots = Array.from({ length: TOTAL_SESSIONS }, (_, k) =>
        `<div class="session-dot ${k < (c.sessions || 0) ? 'done' : ''}" onclick="pmoRender.setCloserSessions('${c.id}', ${k + 1})"></div>`
      ).join('');
      return `
        <div class="closer">
          <div class="closer-head">
            <div class="closer-avatar">${escapeHtml(c.initials || '')}</div>
            <div style="min-width:0;">
              <div class="closer-name" contenteditable="true" data-closer="${c.id}" data-field="name">${escapeHtml(c.name)}</div>
              <div class="closer-role" contenteditable="true" data-closer="${c.id}" data-field="role">${escapeHtml(c.role || '')}</div>
            </div>
          </div>
          <div class="closer-sessions-label">
            <span>Sessões</span><span>${c.sessions || 0}/${TOTAL_SESSIONS}</span>
          </div>
          <div class="closer-sessions">${dots}</div>
          <div class="closer-metrics">
            <div class="closer-metric">
              <div class="closer-metric-label">Conversão</div>
              <div class="closer-metric-val" contenteditable="true" data-closer="${c.id}" data-field="conv">${escapeHtml(String(c.conv ?? '—'))}</div>
            </div>
            <div class="closer-metric">
              <div class="closer-metric-label">Tkt médio</div>
              <div class="closer-metric-val" contenteditable="true" data-closer="${c.id}" data-field="ticket">${escapeHtml(String(c.ticket ?? '—'))}</div>
            </div>
          </div>
        </div>`;
    }).join('');

    container.querySelectorAll('[data-closer]').forEach(el => {
      el.addEventListener('blur', () => {
        const id = el.dataset.closer;
        const field = el.dataset.field;
        const c = state.closers.find(x => x.id === id);
        if (!c) return;
        let val = el.innerText.trim();
        c[field] = val;
        if (field === 'name') {
          const parts = val.split(/\s+/).filter(Boolean);
          c.initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase();
          renderClosers();
        }
        window.pmoData.saveCloser(c);
        showSaved();
      });
    });
  }

  async function setCloserSessions(id, n) {
    if (!isAdmin()) return;
    const c = state.closers.find(x => x.id === id);
    if (!c) return;
    c.sessions = (c.sessions === n) ? n - 1 : n;
    renderClosers();
    await window.pmoData.updateCloserSessions(id, c.sessions);
    showSaved();
  }

  // ---------- Actions ----------
  function renderActions() {
    if (!isAdmin()) return;
    const container = document.getElementById('actionsContainer');
    if (!container) return;
    container.innerHTML = state.actions.map(a => `
      <div class="action-item ${a.done ? 'done' : ''}">
        <div class="checkbox ${a.done ? 'checked' : ''}" onclick="pmoRender.toggleAction('${a.id}')"></div>
        <div class="action-text" contenteditable="true" data-action="${a.id}" data-field="text">${escapeHtml(a.text)}</div>
        <div class="action-meta" contenteditable="true" data-action="${a.id}" data-field="meta">${escapeHtml(a.meta || '')}</div>
        <div class="action-delete" onclick="pmoRender.deleteAction('${a.id}')" title="Remover">×</div>
      </div>`).join('');

    container.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('blur', () => {
        const id = el.dataset.action;
        const a = state.actions.find(x => x.id === id);
        if (!a) return;
        a[el.dataset.field] = el.innerText.trim();
        window.pmoData.saveAction(a);
        showSaved();
      });
    });
  }

  async function toggleAction(id) {
    const a = state.actions.find(x => x.id === id); if (!a) return;
    a.done = !a.done; renderActions();
    await window.pmoData.toggleAction(id, a.done); showSaved();
  }
  async function deleteAction(id) {
    const i = state.actions.findIndex(x => x.id === id);
    if (i < 0) return;
    state.actions.splice(i, 1); renderActions();
    await window.pmoData.deleteAction(id); showSaved();
  }
  async function addAction() {
    if (!isAdmin()) return;
    const sort = state.actions.reduce((m, a) => Math.max(m, a.sort), 0) + 1;
    const created = await window.pmoData.createAction(projectId, 'Nova ação — clique para editar', `Sem ${currentWeek()}`, sort);
    if (created) { state.actions.push(created); renderActions(); showSaved(); }
  }

  // ---------- Finance ----------
  function renderFinance() {
    if (!isAdmin() || !state.finance) return;
    const f = state.finance;
    const mapping = {
      fixo1: moneyBR(f.parcela_1),
      fixo2: moneyBR(f.parcela_2),
      fixoStatus: f.fixo_status || '',
    };
    document.querySelectorAll('[data-key]').forEach(el => {
      const k = el.dataset.key;
      el.textContent = mapping[k] ?? '';
      el.onblur = () => {
        let v = el.innerText.trim();
        const patch = {};
        if (k === 'fixo1') patch.parcela_1 = parseMoney(v);
        else if (k === 'fixo2') patch.parcela_2 = parseMoney(v);
        else if (k === 'fixoStatus') patch.fixo_status = v;
        Object.assign(f, patch);
        window.pmoData.saveFinance(projectId, patch);
        showSaved();
      };
    });
    const vV = document.getElementById('varVendas');
    const vP = document.getElementById('varPct');
    if (vV) vV.value = f.vendas || 0;
    if (vP) vP.value = f.pct_variavel || 0;
    recalcFinance();
  }

  function recalcFinance() {
    if (!state.finance) return;
    const vendas = parseFloat(document.getElementById('varVendas')?.value) || 0;
    const pct = parseFloat(document.getElementById('varPct')?.value) || 0;
    const variavel = vendas * (pct / 100);
    const fixoTotal = Number(state.finance.fixo_total || 0);
    const vT = document.getElementById('varTotal');
    const gT = document.getElementById('grandTotal');
    if (vT) vT.textContent = moneyBR(variavel);
    if (gT) gT.textContent = moneyBR(fixoTotal + variavel);
  }

  function parseMoney(s) {
    const n = parseFloat(String(s).replace(/[^\d,.\-]/g, '').replace(/\./g, '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  }

  // ---------- Notes ----------
  function renderNotes() {
    if (!isAdmin()) return;
    const el = document.getElementById('notesArea');
    if (el && state.notes) el.value = state.notes.content || '';
  }

  // ---------- Digest ----------
  function copyDigest() {
    if (!isAdmin()) return;
    const di = dayIndex();
    const td = totalDays();
    const total = Math.round(overallProgress());
    const completed = state.deliverables.filter(d => deliverableProgress(d) >= 100).length;
    const inProgress = state.deliverables.filter(d => { const p = deliverableProgress(d); return p > 0 && p < 100; }).length;
    const active = state.phases.find(p => p.status === 'active');
    const totalSessions = state.closers.reduce((s, c) => s + (c.sessions || 0), 0);
    const fixo = Number(state.finance?.fixo_total || 0);
    const vendas = parseFloat(document.getElementById('varVendas')?.value) || 0;
    const pct = parseFloat(document.getElementById('varPct')?.value) || 0;
    const variavel = vendas * (pct / 100);

    const TOTAL_SESSIONS = 8;
    const summary =
`PMO ${state.project.name.toUpperCase()} — DIGEST EXECUTIVO
Dia ${di}/${td} · ${active ? active.name : 'Ciclo finalizado'}

NÚMEROS
- Progresso geral: ${total}%
- Entregas: ${completed} concluídas · ${inProgress} em andamento · ${state.deliverables.length - completed - inProgress} a iniciar
- Coaching: ${totalSessions}/${state.closers.length * TOTAL_SESSIONS} sessões realizadas
- Financeiro: ${moneyBR(fixo)} fixo${vendas ? ` + ${moneyBR(variavel)} variável (${pct}% sobre ${moneyBR(vendas)})` : ''}

FASES
${state.phases.map(p => `  ${p.status === 'done' ? '[x]' : p.status === 'active' ? '[~]' : '[ ]'} Fase ${String(p.num).padStart(2,'0')} · ${p.name} (${p.range_label})`).join('\n')}

ENTREGÁVEIS
${state.deliverables.map(d => {
  const p = deliverableProgress(d); const subs = d.subtasks || [];
  const done = subs.filter(s => s.done).length;
  return `  ${p >= 100 ? '[x]' : p > 0 ? '[~]' : '[ ]'} #${String(d.num).padStart(2,'0')} ${d.title} — ${p}% (${done}/${subs.length})`;
}).join('\n')}

PRÓXIMAS AÇÕES
${state.actions.filter(a => !a.done).map(a => `  - ${a.text} (${a.meta || ''})`).join('\n') || '  (nenhuma pendente)'}

${state.notes && state.notes.content ? `RISCOS & OBSERVAÇÕES\n${state.notes.content}\n` : ''}
— Gabriel Heringer · Sales Consulting`;

    navigator.clipboard.writeText(summary).then(() => flashBtn('↗ Copiado!'))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = summary; document.body.appendChild(ta);
        ta.select(); try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        flashBtn('↗ Copiado!');
      });
  }

  function flashBtn(label) {
    const btn = document.querySelector('.btn.primary');
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = label;
    setTimeout(() => { btn.textContent = orig; }, 1200);
  }

  // ---------- Init wiring ----------
  function wireGlobalInputs() {
    document.addEventListener('input', (e) => {
      if (!isAdmin()) return;
      if (e.target.id === 'notesArea') {
        if (!state.notes) state.notes = { content: '' };
        state.notes.content = e.target.value;
        window.pmoData.saveNotes(projectId, e.target.value);
        showSaved();
      }
      if (e.target.id === 'varVendas' || e.target.id === 'varPct') {
        const vendas = parseFloat(document.getElementById('varVendas').value) || 0;
        const pct = parseFloat(document.getElementById('varPct').value) || 0;
        state.finance.vendas = vendas;
        state.finance.pct_variavel = pct;
        recalcFinance(); renderKPIs();
        window.pmoData.saveFinance(projectId, { vendas, pct_variavel: pct });
        showSaved();
      }
    });
  }

  function renderAll() {
    renderTopbar(); renderHeader(); renderKPIs();
    renderGantt(); renderPhases(); renderDeliverables();
    renderClosers(); renderActions(); renderFinance(); renderNotes();
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  return {
    setState, applyRealtime, renderAll,
    cyclePhase, toggleSubtask, addSubtask, deleteSubtask,
    setCloserSessions, toggleAction, deleteAction, addAction,
    copyDigest, wireGlobalInputs,
  };
})();
