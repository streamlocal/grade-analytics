import type { ActivityEvent } from '../models/types';

export const ACTIVITY_DAY_MS = 24 * 60 * 60 * 1000;
export const ANNOUNCEMENT_WEEK_MS = 7 * ACTIVITY_DAY_MS;

export function activityTime(event: ActivityEvent): number {
  const sourceTime = event.type === 'ANNOUNCEMENT_POSTED' ? event.new_value?.posted_at : null;
  const time = Date.parse(typeof sourceTime === 'string' ? sourceTime : event.created_at);
  return Number.isFinite(time) ? time : 0;
}

export function visibleActivity(event: ActivityEvent, now: number): boolean {
  if (event.new_value?.acknowledged_at) return false;
  const age = now - activityTime(event);
  return age >= 0 && age <= (event.type === 'ANNOUNCEMENT_POSTED' ? ANNOUNCEMENT_WEEK_MS : ACTIVITY_DAY_MS);
}

export function activityLabel(event: ActivityEvent): string {
  switch (event.type) {
    case 'ANNOUNCEMENT_POSTED': return 'Announcement';
    case 'ASSIGNMENT_GRADED': case 'ASSIGNMENT_SCORE_CHANGED': return 'Grade';
    case 'ASSIGNMENT_ADDED': return 'New assignment';
    case 'DUE_DATE_CHANGED': return 'Due date';
    case 'GRADE_CHANGED': return 'Course grade';
    default: return 'Assignment';
  }
}
