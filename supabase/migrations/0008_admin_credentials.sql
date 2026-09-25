-- Server-side admin enrollment. No client role can be self-assigned: these
-- tables have no anon/authenticated grants or RLS policies. The Edge Function
-- checks the signed-in user's identity before reading or writing them.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create table if not exists public.admin_credentials (
  user_id uuid primary key references public.admin_users(user_id) on delete cascade,
  password_salt text not null,
  password_hash text not null,
  password_iterations integer not null default 310000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_credentials enable row level security;
revoke all on public.admin_credentials from anon, authenticated;
