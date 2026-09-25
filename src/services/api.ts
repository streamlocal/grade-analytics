import { supabase } from './supabaseClient';

// All LMS-touching calls go through Edge Functions with the user's JWT.
// The raw LMS token NEVER leaves the server; responses contain only masked metadata.
async function authedInvoke(fn: string, body?: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in.');
  const res = await supabase.functions.invoke(fn, {
    body: body ?? {},
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (res.error) throw new Error(res.error.message || `Function ${fn} failed`);
  return res.data;
}

export const api = {
  saveCredential: (baseUrl: string, token: string) =>
    authedInvoke('lms-connect', { base_url: baseUrl, token }),
  testConnection: () => authedInvoke('lms-test', {}),
  deleteCredential: () => authedInvoke('lms-connect', { action: 'delete' }),
  connectionStatus: () => authedInvoke('lms-connect', { action: 'status' }),
  discoverCourses: () => authedInvoke('sync', { mode: 'discover' }),
  setTracked: (courseIds: string[]) => authedInvoke('sync', { mode: 'set-tracked', course_ids: courseIds }),
  // A page-load refresh intentionally updates only grades and assignments.
  // The fuller sync is reserved for the explicit button and the daily job.
  quickSync: () => authedInvoke('sync', { mode: 'quick' }),
  syncNow: () => authedInvoke('sync', { mode: 'sync' }),
  exportData: () => authedInvoke('export-data', {}),
  deleteAllData: () => authedInvoke('delete-data', {}),
  listSessions: () => authedInvoke('user-sessions', { action: 'list' }),
  revokeSession: (sessionId: string) => authedInvoke('user-sessions', { action: 'revoke', session_id: sessionId }),
  signOutAll: () => authedInvoke('user-sessions', { action: 'revoke-all' }),
  adminStatus: () => authedInvoke('admin-dashboard', { action: 'status' }),
  adminEnroll: (displayName: string, password: string) => authedInvoke('admin-dashboard', { action: 'enroll', display_name: displayName, password }),
  adminVerify: (password: string) => authedInvoke('admin-dashboard', { action: 'verify', password }),
  adminDashboard: (password: string) => authedInvoke('admin-dashboard', { action: 'dashboard', password }),
};
