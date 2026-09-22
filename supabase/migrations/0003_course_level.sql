-- Course level for Saint Ignatius GPA calculation.
-- level: 'Regular' | 'Honors' | 'AP' | 'Free'
--  AP = AP, dual-credit, or course with AP prerequisite (+0.5)
--  Free = free period / non-credit, excluded from GPA
alter table public.courses
  add column if not exists level text not null default 'Regular'
  check (level in ('Regular', 'Honors', 'AP', 'Free'));
