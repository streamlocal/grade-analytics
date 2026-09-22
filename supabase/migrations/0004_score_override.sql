-- Optional manual grade override per course.
-- Used when Canvas is missing a grade or the user wants to adjust it.
-- The sync never writes this column, so it survives future syncs.
-- Effective grade = coalesce(score_override, current_score).
alter table public.courses
  add column if not exists score_override numeric;
