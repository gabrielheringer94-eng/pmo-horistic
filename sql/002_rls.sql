-- 002_rls.sql
-- Row Level Security para o PMO multi-tenant.
-- Rodar DEPOIS de 001_init.sql.
--
-- Modelo: dois papéis por organização — 'admin' (full CRUD) e 'client'
-- (SELECT em phases/deliverables/subtasks/state/operation_metrics,
--  UPDATE só em subtasks.done; sem acesso a closers/actions/finance/notes/closer_performance).

-- ============================================================
-- Habilita RLS em todas as tabelas do app
-- ============================================================

alter table organizations       enable row level security;
alter table projects            enable row level security;
alter table memberships         enable row level security;
alter table phases              enable row level security;
alter table deliverables        enable row level security;
alter table subtasks            enable row level security;
alter table closers             enable row level security;
alter table actions             enable row level security;
alter table finance             enable row level security;
alter table notes               enable row level security;
alter table project_state       enable row level security;
alter table operation_metrics   enable row level security;
alter table closer_performance  enable row level security;

-- ============================================================
-- Helpers (SECURITY DEFINER pra evitar recursão de RLS em memberships)
-- ============================================================

create or replace function app_is_member(p_org uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where org_id = p_org and user_id = auth.uid()
  );
$$;

create or replace function app_is_admin(p_org uuid) returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from memberships
    where org_id = p_org and user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function app_project_org(p_project uuid) returns uuid
language sql security definer stable as $$
  select org_id from projects where id = p_project;
$$;

create or replace function app_role_in(p_org uuid) returns text
language sql security definer stable as $$
  select role from memberships
  where org_id = p_org and user_id = auth.uid()
  limit 1;
$$;

-- ============================================================
-- Organizations
-- ============================================================

create policy orgs_select
  on organizations for select
  using (app_is_member(id));

create policy orgs_admin_modify
  on organizations for all
  using (app_is_admin(id))
  with check (app_is_admin(id));

-- ============================================================
-- Memberships  (admins gerenciam, todos enxergam o próprio)
-- ============================================================

create policy mem_select
  on memberships for select
  using (user_id = auth.uid() or app_is_admin(org_id));

create policy mem_admin_modify
  on memberships for all
  using (app_is_admin(org_id))
  with check (app_is_admin(org_id));

-- ============================================================
-- Projects
-- ============================================================

create policy proj_select
  on projects for select
  using (app_is_member(org_id));

create policy proj_admin_modify
  on projects for all
  using (app_is_admin(org_id))
  with check (app_is_admin(org_id));

-- ============================================================
-- Phases / Deliverables / Subtasks  (todos veem; admin escreve)
-- ============================================================

create policy phases_select on phases for select
  using (app_is_member(app_project_org(project_id)));
create policy phases_admin  on phases for all
  using (app_is_admin(app_project_org(project_id)))
  with check (app_is_admin(app_project_org(project_id)));

create policy deliv_select on deliverables for select
  using (app_is_member(app_project_org(project_id)));
create policy deliv_admin  on deliverables for all
  using (app_is_admin(app_project_org(project_id)))
  with check (app_is_admin(app_project_org(project_id)));

create policy subs_select on subtasks for select
  using (
    app_is_member(app_project_org(
      (select project_id from deliverables where id = subtasks.deliverable_id)
    ))
  );

-- Admin: full CRUD em subtasks
create policy subs_admin_insert on subtasks for insert
  with check (
    app_is_admin(app_project_org(
      (select project_id from deliverables where id = subtasks.deliverable_id)
    ))
  );
create policy subs_admin_delete on subtasks for delete
  using (
    app_is_admin(app_project_org(
      (select project_id from deliverables where id = subtasks.deliverable_id)
    ))
  );

-- Update: qualquer membro pode UPDATE — trigger abaixo restringe colunas pro client
create policy subs_member_update on subtasks for update
  using (
    app_is_member(app_project_org(
      (select project_id from deliverables where id = subtasks.deliverable_id)
    ))
  )
  with check (
    app_is_member(app_project_org(
      (select project_id from deliverables where id = subtasks.deliverable_id)
    ))
  );

-- Trigger que impede client de alterar campos != done
create or replace function tg_subtasks_client_guard() returns trigger
language plpgsql security definer as $$
declare
  v_role text;
  v_proj uuid;
begin
  select project_id into v_proj from deliverables where id = new.deliverable_id;
  v_role := app_role_in(app_project_org(v_proj));

  if v_role = 'client' then
    if new.text is distinct from old.text
       or new.sort is distinct from old.sort
       or new.deliverable_id is distinct from old.deliverable_id then
      raise exception 'client_role_can_only_toggle_done';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_subtasks_client_guard
  before update on subtasks
  for each row execute function tg_subtasks_client_guard();

-- ============================================================
-- project_state  (todos leem; admin escreve)
-- ============================================================

create policy state_select on project_state for select
  using (app_is_member(app_project_org(project_id)));
create policy state_admin  on project_state for all
  using (app_is_admin(app_project_org(project_id)))
  with check (app_is_admin(app_project_org(project_id)));

-- ============================================================
-- CONFIDENCIAL — só admin
-- ============================================================

create policy closers_admin on closers for all
  using (app_is_admin(app_project_org(project_id)))
  with check (app_is_admin(app_project_org(project_id)));

create policy actions_admin on actions for all
  using (app_is_admin(app_project_org(project_id)))
  with check (app_is_admin(app_project_org(project_id)));

create policy finance_admin on finance for all
  using (app_is_admin(app_project_org(project_id)))
  with check (app_is_admin(app_project_org(project_id)));

create policy notes_admin on notes for all
  using (app_is_admin(app_project_org(project_id)))
  with check (app_is_admin(app_project_org(project_id)));

create policy cp_admin on closer_performance for all
  using (
    app_is_admin(app_project_org(
      (select project_id from closers where id = closer_performance.closer_id)
    ))
  )
  with check (
    app_is_admin(app_project_org(
      (select project_id from closers where id = closer_performance.closer_id)
    ))
  );

-- ============================================================
-- operation_metrics — todos leem (client vê agregado); admin escreve
-- ============================================================

create policy opm_select on operation_metrics for select
  using (app_is_member(app_project_org(project_id)));
create policy opm_admin  on operation_metrics for all
  using (app_is_admin(app_project_org(project_id)))
  with check (app_is_admin(app_project_org(project_id)));

-- ============================================================
-- Realtime publication (opcional — ative no dashboard também)
-- ============================================================

-- Garante que mudanças em tabelas core viram eventos Realtime.
alter publication supabase_realtime add table
  phases, deliverables, subtasks, closers, actions, finance, notes,
  operation_metrics, closer_performance, project_state;
