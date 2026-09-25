export function readOffline<T>(userId: string | undefined, kind: string): { savedAt: string; rows: T[] } | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(`ga-offline:${userId}:${kind}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.rows) && typeof parsed.savedAt === 'string' ? parsed : null;
  } catch { return null; }
}

export function writeOffline<T>(userId: string | undefined, kind: string, rows: T[]) {
  if (!userId) return;
  try { localStorage.setItem(`ga-offline:${userId}:${kind}`, JSON.stringify({ savedAt: new Date().toISOString(), rows })); }
  catch { /* Private mode and full storage should not break the live app. */ }
}

export function clearOffline(userId: string | undefined) {
  if (!userId) return;
  localStorage.removeItem(`ga-offline:${userId}:courses`);
  localStorage.removeItem(`ga-offline:${userId}:assignments`);
}
