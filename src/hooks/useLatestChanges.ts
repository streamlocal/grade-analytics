import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import type { ActivityEvent, SyncRun } from '../models/types';

export function useLatestChanges(enabled: boolean) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [run, setRun] = useState<SyncRun | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    async function load() {
      const latest = await supabase.from('sync_runs').select('*').eq('status', 'complete').order('started_at', { ascending: false }).limit(1).maybeSingle();
      if (!active) return;
      if (latest.error || !latest.data) { setError('The latest sync details could not be loaded.'); return; }
      const row = latest.data as SyncRun;
      setRun(row);
      const query = await supabase.from('activity_events').select('*')
        .gte('created_at', row.started_at)
        .lte('created_at', row.finished_at ?? new Date().toISOString())
        .order('created_at', { ascending: false }).limit(300);
      if (!active) return;
      if (query.error) setError('Changes from the latest sync could not be loaded.');
      else { setEvents((query.data ?? []) as ActivityEvent[]); setError(''); }
    }
    void load();
    window.addEventListener('ga-sync-complete', load);
    return () => { active = false; window.removeEventListener('ga-sync-complete', load); };
  }, [enabled]);
  return { events, run, error };
}
