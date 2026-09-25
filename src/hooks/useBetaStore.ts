import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../services/supabaseClient';

export interface Reminder { id: string; title: string; at: string }
export interface BetaStore {
  reminders: Reminder[];
  priorities: Record<string, number>;
  effort: Record<string, number>;
  courseGoals: Record<string, number>;
  gpaGoal: number | null;
  notify: { grades: boolean; dueDates: boolean; dueSoon: boolean; goalRisk: boolean };
}

const empty: BetaStore = {
  reminders: [], priorities: {}, effort: {}, courseGoals: {}, gpaGoal: null,
  notify: { grades: false, dueDates: false, dueSoon: false, goalRisk: false },
};

function parse(value: unknown): BetaStore {
  if (!value || typeof value !== 'object') return empty;
  const data = value as Partial<BetaStore>;
  return {
    reminders: Array.isArray(data.reminders) ? data.reminders.filter((r) => r && typeof r.id === 'string' && typeof r.title === 'string' && typeof r.at === 'string').slice(0, 100) : [],
    priorities: data.priorities && typeof data.priorities === 'object' ? data.priorities : {},
    effort: data.effort && typeof data.effort === 'object' ? data.effort : {},
    courseGoals: data.courseGoals && typeof data.courseGoals === 'object' ? data.courseGoals : {},
    gpaGoal: typeof data.gpaGoal === 'number' && Number.isFinite(data.gpaGoal) ? data.gpaGoal : null,
    notify: {
      grades: data.notify?.grades === true,
      dueDates: data.notify?.dueDates === true,
      dueSoon: data.notify?.dueSoon === true,
      goalRisk: data.notify?.goalRisk === true,
    },
  };
}

export function useBetaStore(enabled = true) {
  const { session } = useAuth();
  const [data, setData] = useState<BetaStore>(() => parse(session?.user.user_metadata?.beta_store));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void supabase.auth.getUser().then(({ data: response }) => {
      if (active && response.user && response.user.id === session?.user.id) setData(parse(response.user.user_metadata?.beta_store));
    });
    return () => { active = false; };
  }, [session?.user.id, enabled]);

  async function save(next: BetaStore) {
    const previous = data;
    setData(next);
    setError('');
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ data: { beta_store: next } });
    if (updateError) { setData(previous); setError(`Could not save: ${updateError.message}`); }
    setSaving(false);
    return !updateError;
  }
  return { data, save, error, saving };
}
