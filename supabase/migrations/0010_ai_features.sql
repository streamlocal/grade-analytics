-- AI is disabled until the administrator supplies a Gemini key and enables it.
-- Credentials and site switches are service-role only; generated user data is
-- readable only by its owner through RLS.
alter table public.assignments add column if not exists description_text text;

create table if not exists public.ai_site_settings (
  id boolean primary key default true check (id),
  global_enabled boolean not null default false,
  local_enabled boolean not null default false,
  preview_user_id uuid references auth.users(id) on delete set null,
  key_ciphertext text,
  key_iv text,
  key_last4 text,
  updated_at timestamptz not null default now()
);
insert into public.ai_site_settings (id) values (true) on conflict (id) do nothing;
alter table public.ai_site_settings enable row level security;
revoke all on public.ai_site_settings from anon, authenticated;

create table if not exists public.ai_assignment_tags (
  assignment_id uuid primary key references public.assignments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_hash text not null,
  topics text[] not null default '{}',
  synonyms text[] not null default '{}',
  task_type text,
  chapter text,
  generated_at timestamptz not null default now()
);
create index if not exists ai_tags_user_idx on public.ai_assignment_tags(user_id);
alter table public.ai_assignment_tags enable row level security;
create policy "own AI tags" on public.ai_assignment_tags for select
  using (auth.uid() = user_id);

create table if not exists public.ai_briefings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source_hash text not null,
  content jsonb not null,
  generated_at timestamptz not null default now()
);
alter table public.ai_briefings enable row level security;
create policy "own AI briefing" on public.ai_briefings for select
  using (auth.uid() = user_id);

create table if not exists public.ai_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_requests_time_idx on public.ai_requests(created_at);
create index if not exists ai_requests_user_time_idx on public.ai_requests(user_id, created_at);
alter table public.ai_requests enable row level security;
revoke all on public.ai_requests from anon, authenticated;
