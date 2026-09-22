-- Grade Analytics schema
-- RLS on every user-data table scoped to auth.uid().
-- lms_credentials is deliberately NOT exposed: no grants, no RLS read policy,
-- service_role (Edge Functions) only.

create extension if not exists "pgcrypto";
create extension if not exists "pg_cron" with schema extensions;
create extension if not exists "pg_net" with schema extensions;

-- profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);

-- ENCRYPTED credential store: NO grants to anon/authenticated, NO select policies.
-- Columns: ciphertext + iv (AES-GCM via Edge Function, key in Edge Function secrets).
create table if not exists public.lms_credentials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'canvas',
  base_url text not null,
  ciphertext text not null,
  iv text not null,
  token_last4 text not null default '????',
  last_verified timestamptz,
  updated_at timestamptz default now()
);
alter table public.lms_credentials enable row level security;
revoke all on public.lms_credentials from anon, authenticated;

-- courses
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lms_course_id text not null,
  name text not null,
  course_code text,
  teacher_names text[] default '{}',
  current_score numeric,
  current_grade text,
  points_possible numeric,
  tracked boolean default true,
  updated_at timestamptz default now(),
  unique(user_id, lms_course_id)
);
alter table public.courses enable row level security;
drop policy if exists "own courses" on public.courses;
create policy "own courses" on public.courses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- course snapshots
create table if not exists public.course_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  score numeric,
  grade text,
  points_possible numeric,
  created_at timestamptz default now()
);
create index if not exists idx_snaps_course_time on public.course_snapshots(course_id, created_at);
alter table public.course_snapshots enable row level security;
drop policy if exists "own snaps" on public.course_snapshots;
create policy "own snaps" on public.course_snapshots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- assignments (stable LMS ids, never title as key)
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  lms_assignment_id text not null,
  name text not null,
  category text,
  due_at timestamptz,
  points_possible numeric,
  score numeric,
  grade text,
  missing boolean default false,
  late boolean default false,
  excused boolean default false,
  submitted_at timestamptz,
  html_url text,
  updated_at timestamptz default now(),
  unique(course_id, lms_assignment_id)
);
alter table public.assignments enable row level security;
drop policy if exists "own assignments" on public.assignments;
create policy "own assignments" on public.assignments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- assignment snapshots
create table if not exists public.assignment_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  score numeric,
  missing boolean default false,
  created_at timestamptz default now()
);
alter table public.assignment_snapshots enable row level security;
drop policy if exists "own asnap" on public.assignment_snapshots;
create policy "own asnap" on public.assignment_snapshots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- sync_runs (one in-progress lock per user via partial unique index)
create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running' check (status in ('running','complete','failed')),
  stage text,
  error text,
  started_at timestamptz default now(),
  finished_at timestamptz
);
create unique index if not exists uniq_running_sync_per_user
  on public.sync_runs(user_id) where (status = 'running');
alter table public.sync_runs enable row level security;
drop policy if exists "own syncs" on public.sync_runs;
create policy "own syncs" on public.sync_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- activity events
create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  course_id uuid references public.courses(id) on delete cascade,
  assignment_id uuid references public.assignments(id) on delete set null,
  title text not null,
  message text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_events_user_time on public.activity_events(user_id, created_at desc);
alter table public.activity_events enable row level security;
drop policy if exists "own events" on public.activity_events;
create policy "own events" on public.activity_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- user settings
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_sync boolean default true,
  created_at timestamptz default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "own settings" on public.user_settings;
create policy "own settings" on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
