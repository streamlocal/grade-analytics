import { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import type { Assignment, ActivityEvent, Course, CourseSnapshot, SyncRun } from '../models/types';

export function useCourses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('courses').select('*').order('name');
    if (error) setError(error.message);
    else setCourses((data ?? []) as Course[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  return { courses, loading, error, reload: load };
}

export function useSnapshots(courseId: string | null) {
  const [snaps, setSnaps] = useState<CourseSnapshot[]>([]);
  useEffect(() => {
    let cancelled = false;
    setSnaps([]);
    if (!courseId) return () => { cancelled = true; };
    void fetchSnapshotsForCourses([courseId]).then((data) => {
      if (!cancelled) setSnaps(data);
    }).catch(() => { if (!cancelled) setSnaps([]); });
    return () => { cancelled = true; };
  }, [courseId]);
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
  const reload = () => setTick((t) => t + 1);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    if (courseId === null) {
      setRows([]);
      setLoadedFor(null);
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
          setRows([]);
          setLoadedFor(courseId);
          setLoading(false);
          return;
        }
        all.push(...((data ?? []) as Assignment[]));
        if (!data || data.length < pageSize) break;
      }
      if (!cancelled) {
        setRows(all);
        setLoadedFor(courseId);
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

export function useActivity(limit = 30) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  useEffect(() => {
    supabase.from('activity_events').select('*')
      .order('created_at', { ascending: false }).limit(limit)
      .then(({ data }) => setEvents((data ?? []) as ActivityEvent[]));
  }, [limit]);
  return events;
}

export function useLastSync() {
  const [run, setRun] = useState<SyncRun | null>(null);
  useEffect(() => {
    supabase.from('sync_runs').select('*')
      .eq('status', 'complete')
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setRun((data ?? null) as SyncRun | null));
  }, []);
  return run;
}
