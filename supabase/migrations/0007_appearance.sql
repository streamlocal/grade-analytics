alter table public.user_settings
  add column if not exists appearance text not null default 'current'
  check (appearance in ('current', 'old', 'glass', 'paper'));
