import { describe, expect, it } from 'vitest';
import { ACTIVITY_DAY_MS, ANNOUNCEMENT_WEEK_MS, activityTime, visibleActivity } from './activity';
import type { ActivityEvent } from '../models/types';

const now = Date.parse('2026-09-24T12:00:00Z');
function event(type: string, age: number, extra: Record<string, unknown> = {}): ActivityEvent {
  return { id: 'one', type, course_id: null, assignment_id: null, title: 'Test', message: '',
    old_value: null, new_value: extra, created_at: new Date(now - age).toISOString() };
}

describe('Activity visibility', () => {
  it('keeps ordinary events for 24 hours only', () => {
    expect(visibleActivity(event('ASSIGNMENT_GRADED', ACTIVITY_DAY_MS - 1), now)).toBe(true);
    expect(visibleActivity(event('ASSIGNMENT_GRADED', ACTIVITY_DAY_MS + 1), now)).toBe(false);
  });
  it('keeps unchecked announcements for no more than a week by Canvas post time', () => {
    const e = event('ANNOUNCEMENT_POSTED', 0, { posted_at: new Date(now - ANNOUNCEMENT_WEEK_MS + 1).toISOString() });
    expect(activityTime(e)).toBe(now - ANNOUNCEMENT_WEEK_MS + 1);
    expect(visibleActivity(e, now)).toBe(true);
    expect(visibleActivity({ ...e, new_value: { posted_at: new Date(now - ANNOUNCEMENT_WEEK_MS - 1).toISOString() } }, now)).toBe(false);
  });
  it('hides acknowledged items immediately', () => {
    expect(visibleActivity(event('ANNOUNCEMENT_POSTED', 0, { acknowledged_at: new Date(now).toISOString() }), now)).toBe(false);
  });
});
