alter table public.courses
  add column if not exists grade_checked_at timestamptz,
  add column if not exists assignments_checked_at timestamptz,
  add column if not exists assignments_check_error text;
