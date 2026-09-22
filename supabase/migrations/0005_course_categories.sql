-- Canvas assignment groups (categories) with weights, per course.
-- Populated from /courses/:id/assignment_groups so the What-if simulator
-- can use real categories and weighted grading instead of hardcoded names.
alter table public.courses
  add column if not exists categories jsonb not null default '[]'::jsonb;
