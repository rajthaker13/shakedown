-- The deployment pipeline: cloud runs, releases and their gates, and reports
-- from robots in the field.

create type public.job_state as enum ('queued', 'running', 'completed', 'failed');
create type public.release_stage as enum ('candidate', 'canary', 'fleet', 'retired', 'rolled_back');
create type public.suggestion_status as enum ('open', 'accepted', 'dismissed');

-- ---------------------------------------------------------------------------
-- Cloud runs
-- ---------------------------------------------------------------------------

-- A suite run on the cloud runner. Its id is also the id of the run it produces.
create table public.hosted_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  policy text not null,
  suite text not null,
  label text not null,
  episodes integer not null check (episodes between 1 and 50),
  conditions integer not null default 0,
  state public.job_state not null default 'queued',
  error text,
  -- Condition keys already copied from the runner into this database.
  ingested text[] not null default '{}',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index hosted_jobs_project_idx on public.hosted_jobs (project_id, created_at desc);
create index hosted_jobs_requester_idx on public.hosted_jobs (requested_by, created_at desc);

-- ---------------------------------------------------------------------------
-- Releases
-- ---------------------------------------------------------------------------

-- What is deployed is a checkpoint together with its runtime settings. A
-- release pins both, and the tested run that justified it.
create table public.releases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  number integer not null default 0,
  run_id uuid references public.runs (id) on delete set null,
  policy_label text not null,
  policy_spec text not null default '',
  -- Settings the robot should run the policy with, e.g. n_action_steps.
  runtime_config jsonb not null default '{}'::jsonb,
  stage public.release_stage not null default 'candidate',
  notes text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  unique (project_id, number)
);
create index releases_project_stage_idx on public.releases (project_id, stage, stage_changed_at desc);

-- Every change of stage, with the evidence the gate saw. Never edited.
create table public.release_events (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  from_stage public.release_stage,
  to_stage public.release_stage not null,
  actor uuid references auth.users (id) on delete set null,
  reason text not null default '',
  -- Each gate check with its outcome, as it stood at this moment.
  gate jsonb not null default '[]'::jsonb,
  overridden boolean not null default false,
  created_at timestamptz not null default now()
);
create index release_events_release_idx on public.release_events (release_id, created_at);

create or replace function public.assign_release_number()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('release:' || new.project_id::text, 0));
  select coalesce(max(r.number), 0) + 1 into new.number
  from public.releases r where r.project_id = new.project_id;
  return new;
end;
$$;

create trigger releases_assign_number
  before insert on public.releases
  for each row execute function public.assign_release_number();

-- ---------------------------------------------------------------------------
-- Field reports
-- ---------------------------------------------------------------------------

-- One attempt at the task by a real robot, as reported by the robot.
create table public.field_episodes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  release_id uuid references public.releases (id) on delete set null,
  -- Chosen by the reporter, so that sending a report twice stores it once.
  external_id text not null,
  policy_label text not null,
  robot text not null default '',
  site text not null default '',
  success boolean not null,
  -- A person had to step in.
  intervention boolean not null default false,
  intervention_reason text not null default '',
  note text not null default '',
  steps integer,
  duration_s real,
  -- Conditions measured on the robot: inference_ms, action_delay_ms,
  -- control_hz, image_brightness, frames_dropped.
  measured jsonb not null default '{}'::jsonb,
  -- True when the report came from a simulated stand-in for a robot.
  simulated boolean not null default false,
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (project_id, external_id)
);
create index field_episodes_project_idx on public.field_episodes (project_id, started_at desc);
create index field_episodes_release_idx on public.field_episodes (release_id, started_at desc);

-- A test proposed because of what happened in the field.
create table public.scenario_suggestions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Stable name of the rule and subject, so a suggestion is made once.
  fingerprint text not null,
  title text not null,
  rationale text not null,
  yaml text not null,
  evidence jsonb not null default '{}'::jsonb,
  status public.suggestion_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (project_id, fingerprint)
);
create index scenario_suggestions_project_idx on public.scenario_suggestions (project_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security. As elsewhere, robots and the CLI write through the API
-- with a project key; people read through these policies.
-- ---------------------------------------------------------------------------

alter table public.hosted_jobs enable row level security;
alter table public.releases enable row level security;
alter table public.release_events enable row level security;
alter table public.field_episodes enable row level security;
alter table public.scenario_suggestions enable row level security;

create policy "read hosted jobs" on public.hosted_jobs
  for select to anon, authenticated using (public.can_read_project(project_id));

create policy "read releases" on public.releases
  for select to anon, authenticated using (public.can_read_project(project_id));
create policy "members create releases" on public.releases
  for insert to authenticated
  with check (public.can_write_project(project_id) and stage = 'candidate');
create policy "members delete candidate releases" on public.releases
  for delete to authenticated
  using (public.can_write_project(project_id) and stage = 'candidate');

create policy "read release events" on public.release_events
  for select to anon, authenticated using (public.can_read_project(project_id));

create policy "read field episodes" on public.field_episodes
  for select to anon, authenticated using (public.can_read_project(project_id));
create policy "members delete field episodes" on public.field_episodes
  for delete to authenticated using (public.can_write_project(project_id));

create policy "read suggestions" on public.scenario_suggestions
  for select to anon, authenticated using (public.can_read_project(project_id));
create policy "members resolve suggestions" on public.scenario_suggestions
  for update to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));

-- Gate thresholds live in the project's settings alongside the display ones:
--   min_field_episodes   field attempts a canary needs before it can go to the fleet
--   max_field_drop_pts   how far below the current fleet release a canary may fall
alter table public.projects
  alter column settings set default
  '{"noise_threshold_pts": 5, "min_episodes": 20, "min_field_episodes": 30, "max_field_drop_pts": 10}'::jsonb;
