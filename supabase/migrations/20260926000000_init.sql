-- Shakedown schema.
--
-- Access model: a user belongs to organizations; an organization owns projects;
-- a project owns runs. Users read through row level security. The CLI writes
-- through the API using a project-scoped key, and the API uses the service
-- role, so there are no insert policies on run data.

create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'admin', 'member');
create type public.run_status as enum ('running', 'completed', 'failed', 'cancelled');
create type public.verdict as enum ('PASS', 'WARN', 'FAIL', 'SKIP', 'ERROR');

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members (user_id);

create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  email text not null,
  role public.member_role not null default 'member',
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (org_id, email)
);

-- ---------------------------------------------------------------------------
-- Projects and keys
-- ---------------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'),
  description text not null default '',
  repo_url text,
  default_branch text not null default 'main',
  -- Anyone may read a public project, signed in or not. Used for the demo.
  is_public boolean not null default false,
  -- noise_threshold_pts: deltas smaller than this are drawn as unchanged.
  -- min_episodes: cells with fewer episodes are flagged as under-sampled.
  settings jsonb not null default '{"noise_threshold_pts": 5, "min_episodes": 20}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  -- First characters of the key, shown so a key can be recognized.
  prefix text not null,
  -- SHA-256 of the full key. The key itself is never stored.
  hash text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index api_keys_project_idx on public.api_keys (project_id);

-- ---------------------------------------------------------------------------
-- Runs
-- ---------------------------------------------------------------------------

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Sequential per project, assigned by trigger.
  number integer not null default 0,
  suite text not null,
  policy_label text not null,
  policy_spec text not null default '',
  policy_info jsonb not null default '{}'::jsonb,
  git_sha text,
  git_branch text,
  git_message text,
  git_dirty boolean,
  repository text,
  pull_request integer,
  host jsonb not null default '{}'::jsonb,
  engine_version text,
  status public.run_status not null default 'running',
  verdict public.verdict,
  summary jsonb not null default '{}'::jsonb,
  baseline_run_id uuid references public.runs (id) on delete set null,
  baseline_label text,
  -- Conditions the run intends to execute, so the matrix can show pending cells.
  planned jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_s real,
  created_at timestamptz not null default now(),
  unique (project_id, number)
);
create index runs_project_started_idx on public.runs (project_id, started_at desc);
create index runs_project_branch_idx on public.runs (project_id, suite, git_branch, started_at desc);

create table public.run_conditions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  position integer not null default 0,
  key text not null,
  scenario text not null,
  label text not null,
  description text not null default '',
  env text not null,
  backend text not null default '',
  sweep_name text,
  sweep_value text,
  tags text[] not null default '{}',
  perturbations jsonb not null default '[]'::jsonb,
  perturbation_summary text[] not null default '{}',
  -- Hash of everything that affects outcomes. Equal fingerprints mean the
  -- same seeds under the same conditions, so outcomes can be compared in pairs.
  fingerprint text not null,
  episodes integer not null,
  successes integer not null,
  success_rate real not null,
  ci_low real not null,
  ci_high real not null,
  mean_steps_success real,
  contacts jsonb not null default '{}'::jsonb,
  failure_labels jsonb not null default '{}'::jsonb,
  verdict public.verdict not null,
  checks jsonb not null default '[]'::jsonb,
  comparison jsonb,
  -- Seed to success, used as the baseline for later runs.
  outcomes jsonb not null default '{}'::jsonb,
  duration_s real,
  scenario_source text not null default '',
  error text,
  created_at timestamptz not null default now(),
  unique (run_id, key)
);
create index run_conditions_run_idx on public.run_conditions (run_id, position);
create index run_conditions_project_key_idx on public.run_conditions (project_id, key);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  condition_id uuid not null references public.run_conditions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  seed integer not null,
  success boolean not null,
  steps integer not null,
  max_reward real not null default 0,
  duration_s real,
  failure_label text,
  first_divergence_step integer,
  -- Whether the same seed succeeds with no perturbation. Null when not checked.
  nominal_success boolean,
  contacts jsonb not null default '{}'::jsonb,
  -- Object storage paths, relative to the artifacts bucket.
  video_path text,
  trace_path text,
  error text,
  unique (condition_id, seed)
);
create index episodes_condition_idx on public.episodes (condition_id, success, seed);
create index episodes_run_idx on public.episodes (run_id);

-- Outcomes observed on a real robot, for checking that simulation predicts reality.
create table public.real_trials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  suite text not null,
  condition_key text not null,
  policy_label text not null,
  trial integer not null,
  success boolean not null,
  robot text not null default '',
  operator text not null default '',
  notes text not null default '',
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint real_trials_unique unique (project_id, suite, condition_key, policy_label, robot, trial)
);
create index real_trials_project_idx on public.real_trials (project_id, suite, policy_label);

-- Messages from the contact form on the public site.
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text not null default '',
  company text not null default '',
  message text not null default '',
  source text not null default 'site',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Functions and triggers
-- ---------------------------------------------------------------------------

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = target_org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_org_admin(target_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = target_org
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  );
$$;

create or replace function public.can_read_project(target_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    where p.id = target_project
      and (
        p.is_public
        or exists (
          select 1 from public.org_members m
          where m.org_id = p.org_id and m.user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function public.can_write_project(target_project uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
    join public.org_members m on m.org_id = p.org_id
    where p.id = target_project and m.user_id = (select auth.uid())
  );
$$;

-- Every new user gets a profile and a personal organization, and joins any
-- organization that invited their email address.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  new_org uuid;
  base_slug text;
  final_slug text;
  attempt integer := 0;
  display text;
begin
  display := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    split_part(new.email, '@', 1)
  );
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, display);

  base_slug := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  if char_length(base_slug) < 3 then
    base_slug := 'team-' || base_slug;
  end if;
  base_slug := left(base_slug, 30);
  final_slug := base_slug;
  while exists (select 1 from public.orgs o where o.slug = final_slug) loop
    attempt := attempt + 1;
    final_slug := base_slug || '-' || substr(md5(new.id::text || attempt::text), 1, 5);
  end loop;

  insert into public.orgs (name, slug, created_by)
  values (display || '''s team', final_slug, new.id)
  returning id into new_org;
  insert into public.org_members (org_id, user_id, role) values (new_org, new.id, 'owner');

  insert into public.org_members (org_id, user_id, role)
  select i.org_id, new.id, i.role
  from public.org_invites i
  where lower(i.email) = lower(new.email) and i.accepted_at is null
  on conflict do nothing;
  update public.org_invites set accepted_at = now()
  where lower(email) = lower(new.email) and accepted_at is null;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.assign_run_number()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Serialize numbering per project so concurrent uploads get distinct numbers.
  perform pg_advisory_xact_lock(hashtextextended(new.project_id::text, 0));
  select coalesce(max(r.number), 0) + 1 into new.number
  from public.runs r where r.project_id = new.project_id;
  return new;
end;
$$;

create trigger runs_assign_number
  before insert on public.runs
  for each row execute function public.assign_run_number();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.orgs enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;
alter table public.projects enable row level security;
alter table public.api_keys enable row level security;
alter table public.runs enable row level security;
alter table public.run_conditions enable row level security;
alter table public.episodes enable row level security;
alter table public.real_trials enable row level security;
alter table public.leads enable row level security;

create policy "read own profile or teammates" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.org_members mine
      join public.org_members theirs on theirs.org_id = mine.org_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
    )
  );
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members read org" on public.orgs
  for select to authenticated using (public.is_org_member(id));
-- The name of an organization is visible alongside its public projects.
create policy "read org of a public project" on public.orgs
  for select to anon, authenticated
  using (exists (select 1 from public.projects p where p.org_id = orgs.id and p.is_public));
create policy "admins update org" on public.orgs
  for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy "members read membership" on public.org_members
  for select to authenticated using (public.is_org_member(org_id));
create policy "admins remove members" on public.org_members
  for delete to authenticated
  using (public.is_org_admin(org_id) and role <> 'owner');

create policy "admins read invites" on public.org_invites
  for select to authenticated using (public.is_org_admin(org_id));
create policy "admins create invites" on public.org_invites
  for insert to authenticated with check (public.is_org_admin(org_id));
create policy "admins delete invites" on public.org_invites
  for delete to authenticated using (public.is_org_admin(org_id));

create policy "read projects" on public.projects
  for select to anon, authenticated
  using (is_public or public.is_org_member(org_id));
create policy "members create projects" on public.projects
  for insert to authenticated
  with check (public.is_org_member(org_id) and not is_public);
create policy "members update projects" on public.projects
  for update to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id) and not is_public);
create policy "admins delete projects" on public.projects
  for delete to authenticated using (public.is_org_admin(org_id));

-- Key hashes are never sent to the browser: the API selects named columns only.
create policy "members read keys" on public.api_keys
  for select to authenticated using (public.can_write_project(project_id));

create policy "read runs" on public.runs
  for select to anon, authenticated using (public.can_read_project(project_id));
create policy "members delete runs" on public.runs
  for delete to authenticated using (public.can_write_project(project_id));

create policy "read conditions" on public.run_conditions
  for select to anon, authenticated using (public.can_read_project(project_id));

create policy "read episodes" on public.episodes
  for select to anon, authenticated using (public.can_read_project(project_id));

create policy "read real trials" on public.real_trials
  for select to anon, authenticated using (public.can_read_project(project_id));
create policy "members delete real trials" on public.real_trials
  for delete to authenticated using (public.can_write_project(project_id));

-- No policies on leads: only the service role reads or writes them.

revoke all on public.api_keys from anon;
revoke all on public.leads from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- Private bucket. The app hands out short-lived signed URLs after checking access.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'artifacts', 'artifacts', false, 52428800,
  array['video/mp4', 'application/json', 'image/png', 'image/jpeg']
)
on conflict (id) do nothing;

-- Live updates while a run is in progress.
alter publication supabase_realtime add table public.runs;
alter publication supabase_realtime add table public.run_conditions;
