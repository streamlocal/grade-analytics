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
    if (!courseId) return;
    supabase.from('course_snapshots').select('*')
      .eq('course_id', courseId).order('created_at')
      .then(({ data }) => setSnaps((data ?? []) as CourseSnapshot[]));
  }, [courseId]);
  return snaps;
}

export function useAssignments(courseId?: string | null) {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);
  useEffect(() => {
    setLoading(true);
    let q = supabase.from('assignments').select('*').order('due_at', { nullsFirst: false });
    if (courseId) q = q.eq('course_id', courseId);
    q.then(({ data }) => { setRows((data ?? []) as Assignment[]); setLoading(false); });
  }, [courseId, tick]);
  return { assignments: rows, loading, reload };
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
      .order('started_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setRun((data ?? null) as SyncRun | null));
  }, []);
  return run;
}
