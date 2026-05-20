-- 003_seed_horistic.sql
-- Carrega a organização Horistic Investimentos com o projeto "PMO Horistic 60 dias"
-- e todos os dados padrão (4 fases, 12 entregáveis com subtarefas, 5 closers, 5 ações).
-- Idempotente: usa ON CONFLICT em slugs/uniques.

-- ============================================================
-- Organização + projeto
-- ============================================================

insert into organizations (name, slug)
values ('Horistic Investimentos', 'horistic')
on conflict (slug) do nothing;

insert into projects (org_id, name, slug, start_date, total_days)
select id, 'PMO Horistic 60 dias', 'pmo-60d', '2026-05-22', 60
from organizations where slug = 'horistic'
on conflict (org_id, slug) do nothing;

-- ============================================================
-- Wrapper: pega o id do projeto pra reuso
-- ============================================================

do $$
declare
  v_proj uuid;
begin
  select p.id into v_proj
  from projects p
  join organizations o on o.id = p.org_id
  where o.slug = 'horistic' and p.slug = 'pmo-60d';

  -- ---------- FASES ----------
  delete from phases where project_id = v_proj;
  insert into phases (project_id, num, name, range_label, start_week, end_week, status, sort) values
    (v_proj, 1, 'Imersão',            'Sem. 1–2',   1,  2, 'active', 1),
    (v_proj, 2, 'Desenho do sistema', 'Sem. 3–5',   3,  5, 'todo',   2),
    (v_proj, 3, 'Implantação',        'Sem. 6–10',  6, 10, 'todo',   3),
    (v_proj, 4, 'Handover',           'Sem. 11–12', 11, 12, 'todo',  4);

  -- ---------- CLOSERS ----------
  delete from closers where project_id = v_proj;
  insert into closers (project_id, initials, name, role, sessions, sort) values
    (v_proj, 'RC', 'Closer 1', 'Senior', 0, 1),
    (v_proj, 'MA', 'Closer 2', 'Senior', 0, 2),
    (v_proj, 'LF', 'Closer 3', 'Pleno',  0, 3),
    (v_proj, 'TS', 'Closer 4', 'Pleno',  0, 4),
    (v_proj, 'BN', 'Closer 5', 'Júnior', 0, 5);

  -- ---------- AÇÕES ----------
  delete from actions where project_id = v_proj;
  insert into actions (project_id, text, meta, done, sort) values
    (v_proj, 'Confirmar data oficial do kickoff com a liderança da Horistic', 'Sem 1', false, 1),
    (v_proj, 'Agendar entrevistas individuais com os 5 closers',              'Sem 1', false, 2),
    (v_proj, 'Solicitar acesso ao histórico da base ativa e CRM atual',       'Sem 1', false, 3),
    (v_proj, 'Definir cronograma de escuta de chamadas reais',                'Sem 2', false, 4),
    (v_proj, 'Apresentar 1ª versão da tese comercial à liderança',            'Sem 2', false, 5);

  -- ---------- FINANCEIRO ----------
  insert into finance (project_id, fixo_total, parcela_1, parcela_2, fixo_status, vendas, pct_variavel)
  values (v_proj, 10000, 5000, 5000, 'Aguardando NF #1', 0, 1)
  on conflict (project_id) do update set
    fixo_total   = excluded.fixo_total,
    parcela_1    = excluded.parcela_1,
    parcela_2    = excluded.parcela_2,
    fixo_status  = excluded.fixo_status,
    vendas       = excluded.vendas,
    pct_variavel = excluded.pct_variavel;

  -- ---------- NOTAS / STATE ----------
  insert into notes (project_id, content) values (v_proj, '')
    on conflict (project_id) do nothing;
  insert into project_state (project_id) values (v_proj)
    on conflict (project_id) do nothing;

  -- ---------- ENTREGÁVEIS + SUBTAREFAS ----------
  delete from deliverables where project_id = v_proj;

  -- Helper: insere um deliverable e suas subtasks
  -- Como PL/pgSQL não tem CTE encadeada com múltiplas linhas simples,
  -- usamos um bloco repetitivo por deliverable.

  declare
    v_del uuid;
  begin
    -- #01 Diagnóstico — Auditoria da operação
    insert into deliverables (project_id, num, tag, tag_label, title, description, start_week, end_week, sort)
    values (v_proj, 1, 'diag', 'Diagnóstico', 'Auditoria da operação',
            'Sessões de descoberta com C-level + análise de CRM para mapear funil, gargalos e benchmark entre closers.',
            1, 2, 1)
    returning id into v_del;
    insert into subtasks (deliverable_id, text, sort) values
      (v_del, 'Conduzir sessão 1 com C-level (60min, gravada) — modelo, pessoas, dores', 1),
      (v_del, 'Solicitar acesso de leitura ao CRM ou exports em CSV', 2),
      (v_del, 'Montar planilha com 5 abas: funil, performance, perdidos, cohort, atividade', 3),
      (v_del, 'Identificar gargalo principal do funil com evidência numérica', 4),
      (v_del, 'Mapear diferença entre top 3 e bottom 3 performers', 5);

    -- #02 Diagnóstico — Segmentação da base
    insert into deliverables (project_id, num, tag, tag_label, title, description, start_week, end_week, sort)
    values (v_proj, 2, 'diag', 'Diagnóstico', 'Segmentação da base',
            'Classificação da carteira por perfil, ticket, potencial de up-sell e tempo de relação.',
            1, 2, 2)
    returning id into v_del;
    insert into subtasks (deliverable_id, text, sort) values
      (v_del, 'Definir ICP em 1 parágrafo (firmográfico + gatilhos + exclusões)', 1),
      (v_del, 'Mapear 3 personas (decisor, influenciador, usuário) com dores específicas', 2),
      (v_del, 'Classificar carteira por ticket, recência e potencial de up-sell', 3),
      (v_del, 'Cruzar segmentos com win rate histórico', 4),
      (v_del, 'Priorizar top 50 contas para abordagem cross/up-sell', 5);

    -- #03 Diagnóstico — Tese comercial documentada
    insert into deliverables (project_id, num, tag, tag_label, title, description, start_week, end_week, sort)
    values (v_proj, 3, 'diag', 'Diagnóstico', 'Tese comercial documentada',
            'Matriz de maturidade, gaps priorizados e desenho do sistema-alvo.',
            2, 3, 3)
    returning id into v_del;
    insert into subtasks (deliverable_id, text, sort) values
      (v_del, 'Aplicar matriz de maturidade nas 8 dimensões (nota 1 a 5)', 1),
      (v_del, 'Priorizar top 5 gaps com matriz ICE/RICE (impacto × esforço)', 2),
      (v_del, 'Escrever sumário executivo de 1 página com 3 principais achados', 3),
      (v_del, 'Montar relatório de 10–12 páginas com radar + recomendações', 4),
      (v_del, 'Validar tese com liderança Horistic antes de avançar', 5);

    -- #04 Processo — Playbook de cross/up-sell
    insert into deliverables (project_id, num, tag, tag_label, title, description, start_week, end_week, sort)
    values (v_proj, 4, 'proc', 'Processo', 'Playbook de cross/up-sell',
            'Scripts por perfil de investidor, objeções, battle cards e política de desconto.',
            3, 5, 4)
    returning id into v_del;
    insert into subtasks (deliverable_id, text, sort) values
      (v_del, 'Escrever as 10 seções do playbook V1 (Notion/Docs versionado)', 1),
      (v_del, 'Documentar roteiros por etapa (discovery, demo, proposta, negociação)', 2),
      (v_del, 'Mapear top 15 objeções com resposta-modelo + prova social', 3),
      (v_del, 'Criar battle cards dos 3 concorrentes principais', 4),
      (v_del, 'Definir tabela de pricing e política de alçada de desconto', 5);

    -- #05 Processo — Cadência de relacionamento
    insert into deliverables (project_id, num, tag, tag_label, title, description, start_week, end_week, sort)
    values (v_proj, 5, 'proc', 'Processo', 'Cadência de relacionamento',
            'Régua pós-aporte, SLA por etapa e critérios de handoff entre pré-vendas e closers.',
            3, 5, 5)
    returning id into v_del;
    insert into subtasks (deliverable_id, text, sort) values
      (v_del, 'Desenhar régua de touchpoints pós-aporte (D+7, D+30, D+90)', 1),
      (v_del, 'Formalizar critérios de aceite e devolução de lead (5 + 5)', 2),
      (v_del, 'Definir SLA em dias por etapa do funil', 3),
      (v_del, 'Criar sequence templates de follow-up no CRM', 4),
      (v_del, 'Agendar revisão mensal do SLA com líderes', 5);

    -- #06 Processo — Critério de priorização
    insert into deliverables (project_id, num, tag, tag_label, title, description, start_week, end_week, sort)
    values (v_proj, 6, 'proc', 'Processo', 'Critério de priorização',
            'Stage gates verificáveis + scoring MEDDPICC para forecast acurado.',
            4, 5, 6)
    returning id into v_del;
    insert into subtasks (deliverable_id, text, sort) values
      (v_del, 'Escolher metodologia de qualificação (BANT / MEDDIC / MEDDPICC)', 1),
      (v_del, 'Definir 5–7 etapas do funil com critérios verificáveis (entrada/saída)', 2),
      (v_del, 'Implantar regra: sem evidência anexa, deal não avança', 3),
      (v_del, 'Configurar score MEDDPICC (0–16) com thresholds de forecast', 4),
      (v_del, 'Auditar os primeiros 20 deals no novo critério', 5);

    -- #07 Processo — Rotina comercial
    insert into deliverables (project_id, num, tag, tag_label, title, description, start_week, end_week, sort)
    values (v_proj, 7, 'proc', 'Processo', 'Rotina comercial',
            'Daily, weekly forecast, monthly business review e QBR — calendário e pautas.',
            4, 6, 7)
    returning id into v_del;
    insert into subtasks (deliverable_id, text, sort) values
      (v_del, 'Instalar daily standup de 15min (top deals em risco + foco do dia)', 1),
      (v_del, 'Instalar weekly forecast de 60min com squad', 2),
      (v_del, 'Instalar Monthly Business Review de 90min', 3),
      (v_del, 'Bloquear Quarterly QBR (dia inteiro) na agenda da liderança', 4),
      (v_del, 'Documentar pauta padrão de cada rito no playbook', 5);

    -- #08 Execução — Coaching técnico individual
    insert into deliverables (project_id, num, tag, tag_label, title, description, start_week, end_week, sort)
    values (v_proj, 8, 'exec', 'Execução', 'Coaching técnico individual',
            'Programa 30-60-90, matriz de competências e reforço espaçado.',
            6, 10, 8)
    returning id into v_del;
    insert into subtasks (deliverable_id, text, sort) values
      (v_del, 'Desenhar programa 30-60-90 com marcos mensuráveis por fase', 1),
      (v_del, 'Implantar certificação de produto (nota mínima ≥ 85%)', 2),
      (v_del, 'Aplicar matriz de 8 competências do closer (1 a 4) por trimestre', 3),
      (v_del, 'Rodar 1 workshop semanal de metodologia (30min, gap-driven)', 4),
      (v_del, 'Programar reforço espaçado em D+30, D+60 e D+90', 5);

    -- #09 Execução — Acompanhamento de chamadas
    insert into deliverables (project_id, num, tag, tag_label, title, description, start_week, end_week, sort)
    values (v_proj, 9, 'exec', 'Execução', 'Acompanhamento de chamadas',
            'Escuta ativa, framework SBI e biblioteca de best calls.',
            6, 10, 9)
    returning id into v_del;
    insert into subtasks (deliverable_id, text, sort) values
      (v_del, 'Ativar gravação obrigatória ou conversation intelligence', 1),
      (v_del, 'Estabelecer revisão de 2 calls por closer por semana', 2),
      (v_del, 'Treinar gestor no framework SBI (Situação–Behavior–Impacto)', 3),
      (v_del, 'Construir biblioteca de best calls por etapa do funil', 4),
      (v_del, 'Documentar 5 deals ganhos + 5 perdidos com aprendizados', 5);

    -- #10 Execução — Coaching de gestão
    insert into deliverables (project_id, num, tag, tag_label, title, description, start_week, end_week, sort)
    values (v_proj, 10, 'exec', 'Execução', 'Coaching de gestão',
            'Treinar a liderança no sistema para sustentar pós-ciclo.',
            6, 12, 10)
    returning id into v_del;
    insert into subtasks (deliverable_id, text, sort) values
      (v_del, 'Bloquear 1:1 de 45min semanal com cada closer (não cancelável)', 1),
      (v_del, 'Treinar gestor no roteiro fixo de 1:1 (5 blocos)', 2),
      (v_del, 'Instalar pipeline review semanal com critérios MEDDPICC', 3),
      (v_del, 'Auditar % de 1:1s realizadas vs agendadas (mensal)', 4),
      (v_del, 'Construir PDI individual para cada closer', 5);

    -- #11 Execução — Estruturação do CRM
    insert into deliverables (project_id, num, tag, tag_label, title, description, start_week, end_week, sort)
    values (v_proj, 11, 'exec', 'Execução', 'Estruturação do CRM',
            'Painel de métricas em 3 camadas + pipeline hygiene.',
            7, 10, 11)
    returning id into v_del;
    insert into subtasks (deliverable_id, text, sort) values
      (v_del, 'Implantar stage gates com evidência objetiva por etapa', 1),
      (v_del, 'Configurar painel em 3 camadas (activity, pipeline, outcome)', 2),
      (v_del, 'Calcular pipeline coverage e alvo de 3–4x da meta', 3),
      (v_del, 'Definir regras de pipeline hygiene (atualização tempestiva)', 4),
      (v_del, 'Treinar closers nos novos campos obrigatórios e stage gates', 5);

    -- #12 Execução — Handover & continuidade
    insert into deliverables (project_id, num, tag, tag_label, title, description, start_week, end_week, sort)
    values (v_proj, 12, 'exec', 'Execução', 'Handover & continuidade',
            'Win/loss, baseline vs meta e plano dos 90 dias seguintes.',
            11, 12, 12)
    returning id into v_del;
    insert into subtasks (deliverable_id, text, sort) values
      (v_del, 'Conduzir 1ª win/loss analysis pós-implantação (5 ganhos + 5 perdidos)', 1),
      (v_del, 'Estabilizar painel de métricas e governança rodando', 2),
      (v_del, 'Documentar baseline vs meta dos 6 indicadores-chave', 3),
      (v_del, 'Realizar QBR pós-implantação com liderança', 4),
      (v_del, 'Entregar plano de continuidade para os 90 dias seguintes', 5);
  end;
end $$;
