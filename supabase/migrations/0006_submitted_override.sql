-- Manual "submitted" override for an assignment.
--   null  = follow Canvas (submitted_at)
--   true  = user marked submitted
--   false = user marked not submitted
-- The sync never writes this column, so manual marks survive future syncs.
alter table public.assignments
  add column if not exists submitted_override boolean;
