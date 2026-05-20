-- 001_init.sql
-- Schema base do PMO multi-tenant.
-- Rodar UMA vez por projeto Supabase, antes do 002_rls.sql.

create extension if not exists pgcrypto;

-- ============================================================
-- Núcleo multi-tenant
-- ============================================================

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

create table projects (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  slug        text not null,
  start_date  date not null default current_date,
  total_days  int  not null default 60,
  created_at  timestamptz not null default now(),
  unique (org_id, slug)
);

create table memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  role        text not null check (role in ('admin','client')),
  created_at  timestamptz not null default now(),
  unique (user_id, org_id)
);

-- ============================================================
-- PMO — entregáveis, fases, subtarefas
-- ============================================================

create table phases (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  num          int  not null,
  name         text not null,
  range_label  text,
  start_week   int,
  end_week     int,
  status       text not null default 'pending',
  sort         int  not null default 0
);

create table deliverables (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  num          int  not null,
  tag          text,
  tag_label    text,
  title        text not null,
  description  text,
  start_week   int,
  end_week     int,
  progress     int  not null default 0 check (progress between 0 and 100),
  sort         int  not null default 0
);

create table subtasks (
  id              uuid primary key default gen_random_uuid(),
  deliverable_id  uuid not null references deliverables(id) on delete cascade,
  text            text not null,
  done            boolean not null default false,
  sort            int  not null default 0
);

-- ============================================================
-- Confidencial (admin-only) — closers, ações, financeiro, notas
-- ============================================================

create table closers (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  initials    text,
  name        text not null,
  role        text,
  sessions    int  default 0,
  conv        numeric(5,2)  default 0,
  ticket      numeric(12,2) default 0,
  sort        int  not null default 0
);

create table actions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  text        text not null,
  meta        text,
  done        boolean not null default false,
  sort        int  not null default 0
);

create table finance (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade unique,
  fixo_total    numeric(12,2) default 0,
  parcela_1     numeric(12,2) default 0,
  parcela_2     numeric(12,2) default 0,
  fixo_status   text,
  vendas        numeric(12,2) default 0,
  pct_variavel  numeric(5,2)  default 0
);

create table notes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade unique,
  content     text not null default '',
  updated_at  timestamptz not null default now()
);

-- Estado compartilhado leve (last-touched, locks futuros).
-- day_index NÃO é mais persistido — derivado de projects.start_date no client.
create table project_state (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade unique,
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- Página de Resultados / Operação (fora do PMO)
-- ============================================================

create table operation_metrics (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  week_start      date not null,
  sessions        int  default 0,
  conversations   int  default 0,
  proposals       int  default 0,
  closed          int  default 0,
  revenue         numeric(12,2) default 0,
  sort            int  not null default 0,
  unique (project_id, week_start)
);

create table closer_performance (
  id          uuid primary key default gen_random_uuid(),
  closer_id   uuid not null references closers(id) on delete cascade,
  week_start  date not null,
  sessions    int  default 0,
  conv        numeric(5,2)  default 0,
  deals       int  default 0,
  revenue     numeric(12,2) default 0,
  unique (closer_id, week_start)
);

-- ============================================================
-- Triggers utilitários
-- ============================================================

create or replace function tg_set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_notes_updated_at
  before update on notes
  for each row execute function tg_set_updated_at();

create trigger trg_state_updated_at
  before update on project_state
  for each row execute function tg_set_updated_at();

-- ============================================================
-- Índices
-- ============================================================

create index idx_projects_org          on projects(org_id);
create index idx_memberships_user      on memberships(user_id);
create index idx_memberships_org       on memberships(org_id);
create index idx_phases_project        on phases(project_id, sort);
create index idx_deliverables_project  on deliverables(project_id, sort);
create index idx_subtasks_deliverable  on subtasks(deliverable_id, sort);
create index idx_closers_project       on closers(project_id, sort);
create index idx_actions_project       on actions(project_id, sort);
create index idx_op_metrics_project    on operation_metrics(project_id, week_start);
create index idx_cp_closer             on closer_performance(closer_id, week_start);
