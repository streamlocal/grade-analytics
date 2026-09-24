import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Assignment, ActivityEvent, Course, CourseSnapshot, SyncRun } from '../models/types';
import { ANNOUNCEMENT_WEEK_MS, activityTime, visibleActivity } from '../utils/activity';

export function useCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);

  async function load() {
    // Keep the existing screen in place during background syncs. Replacing a
    // populated dashboard with a skeleton on every refresh was both jarring
    // and could reset inputs in Compare while a grade was being edited.
    if (!hasLoaded.current) {
      setLoading(true);
      setError(null);
    }
    const { data, error } = await supabase
      .from('courses').select('*').order('name');
    if (error) setError(error.message);
    else {
      setCourses((data ?? []) as Course[]);
      hasLoaded.current = true;
      setError(null);
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
    window.addEventListener('ga-sync-complete', load);
    return () => window.removeEventListener('ga-sync-complete', load);
  }, []);
  return { courses, loading, error, reload: load };
}

export function useSnapshots(courseId: string | null) {
  const [snaps, setSnaps] = useState<CourseSnapshot[]>([]);
  const [tick, setTick] = useState(0);
  const previousCourseId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const reload = () => setTick((value) => value + 1);
    window.addEventListener('ga-sync-complete', reload);
    return () => window.removeEventListener('ga-sync-complete', reload);
  }, []);
  useEffect(() => {
    let cancelled = false;
    // A background refresh must not blank an already visible chart. Clear only
    // when the visitor actually switches to another course.
    if (previousCourseId.current !== courseId) setSnaps([]);
    previousCourseId.current = courseId;
    if (!courseId) return () => { cancelled = true; };
    void fetchSnapshotsForCourses([courseId]).then((data) => {
      if (!cancelled) setSnaps(data);
    }).catch(() => { if (!cancelled) setSnaps([]); });
    return () => { cancelled = true; };
  }, [courseId, tick]);
  return snaps;
}

export async function fetchSnapshotsForCourses(courseIds: string[]): Promise<CourseSnapshot[]> {
  if (!courseIds.length) return [];
  const all: CourseSnapshot[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from('course_snapshots').select('*')
      .in('course_id', courseIds).order('created_at').order('id')
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    all.push(...((data ?? []) as CourseSnapshot[]));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

export function useAssignments(courseId?: string | null) {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const loadedForRef = useRef<string | null | undefined>(undefined);
  const reload = () => setTick((t) => t + 1);
  useEffect(() => {
    window.addEventListener('ga-sync-complete', reload);
    return () => window.removeEventListener('ga-sync-complete', reload);
  }, []);
  useEffect(() => {
    let cancelled = false;
    const newScope = loadedForRef.current !== courseId;
    if (newScope) {
      setLoading(true);
      setError(null);
    }
    if (courseId === null) {
      setRows([]);
      setLoadedFor(null);
      loadedForRef.current = null;
      setLoading(false);
      return () => { cancelled = true; };
    }
    async function load() {
      const all: Assignment[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        let q = supabase.from('assignments').select('*')
          .order('due_at', { nullsFirst: false }).order('id').range(offset, offset + pageSize - 1);
        if (courseId) q = q.eq('course_id', courseId);
        const { data, error: queryError } = await q;
        if (cancelled) return;
        if (queryError) {
          setError(queryError.message);
          // Keep known assignments visible if a background refresh fails.
          if (newScope) {
            setRows([]);
            setLoadedFor(courseId);
            loadedForRef.current = courseId;
          }
          setLoading(false);
          return;
        }
        all.push(...((data ?? []) as Assignment[]));
        if (!data || data.length < pageSize) break;
      }
      if (!cancelled) {
        setRows(all);
        setLoadedFor(courseId);
        loadedForRef.current = courseId;
        setError(null);
        setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [courseId, tick]);
  return {
    assignments: loadedFor === courseId ? rows : [],
    loading: loadedFor !== courseId || loading,
    error: loadedFor === courseId ? error : null,
    reload,
  };
}

export function useActivity() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const hasLoaded = useRef(false);
  useEffect(() => {
    const reload = () => setTick((value) => value + 1);
    window.addEventListener('ga-sync-complete', reload);
    return () => window.removeEventListener('ga-sync-complete', reload);
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!hasLoaded.current) {
        setLoading(true);
        setError(null);
      }
      const now = Date.now();
      const cutoff = new Date(now - ANNOUNCEMENT_WEEK_MS).toISOString();
      const all: ActivityEvent[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error: queryError } = await supabase.from('activity_events').select('*')
          .gte('created_at', cutoff).order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (cancelled) return;
        if (queryError) {
          setError(queryError.message);
          setLoading(false);
          return;
        }
        all.push(...((data ?? []) as ActivityEvent[]));
        if (!data || data.length < pageSize) break;
      }
      all.sort((a, b) => activityTime(b) - activityTime(a) || b.created_at.localeCompare(a.created_at));
      setEvents(all.filter((event) => visibleActivity(event, now)));
      hasLoaded.current = true;
      setError(null);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [tick]);

  async function markSeen(event: ActivityEvent) {
    setEvents((current) => current.filter((item) => item.id !== event.id));
    const { data, error: updateError } = await supabase.from('activity_events')
      .update({ new_value: { ...event.new_value, acknowledged_at: new Date().toISOString() } })
      .eq('id', event.id).select('id').single();
    if (updateError || !data) {
      setError('Could not mark that item as seen. Please try again.');
      setEvents((current) => [...current, event].sort((a, b) => activityTime(b) - activityTime(a)));
    }
  }

  return { events, loading, error, markSeen, reload: () => setTick((value) => value + 1) };
}

export function useLastSync() {
  const [run, setRun] = useState<SyncRun | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const reload = () => setTick((value) => value + 1);
    window.addEventListener('ga-sync-complete', reload);
    return () => window.removeEventListener('ga-sync-complete', reload);
  }, []);
  useEffect(() => {
    supabase.from('sync_runs').select('*')
      .eq('status', 'complete')
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setRun((data ?? null) as SyncRun | null));
  }, [tick]);
  return { run, reload: () => setTick((value) => value + 1) };
}
