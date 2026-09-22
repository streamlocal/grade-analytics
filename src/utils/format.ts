export function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
}
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function letterFor(score: number | null): string {
  if (score == null || Number.isNaN(score)) return '—';
  const p = Math.floor(score);
  if (p >= 97) return 'A+';
  if (p >= 93) return 'A';
  if (p >= 90) return 'A−';
  if (p >= 87) return 'B+';
  if (p >= 83) return 'B';
  if (p >= 80) return 'B−';
  if (p >= 77) return 'C+';
  if (p >= 73) return 'C';
  if (p >= 70) return 'C−';
  if (p >= 68) return 'D+';
  if (p >= 66) return 'D';
  if (p >= 65) return 'D−';
  return 'F';
}
export function delta(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return Math.round((b - a) * 10) / 10;
}
export function deltaClass(d: number | null): string {
  if (d == null) return 'delta-flat';
  if (d > 0.05) return 'delta-up';
  if (d < -0.05) return 'delta-down';
  return 'delta-flat';
}
export function scoreAt(snapshots: { score: number | null; created_at: string }[], daysAgo: number): number | null {
  if (!snapshots.length) return null;
  const cutoff = Date.now() - daysAgo * 86400_000;
  const older = snapshots.filter((s) => new Date(s.created_at).getTime() <= cutoff);
  const pick = older.length ? older[older.length - 1] : snapshots[0];
  return pick?.score ?? null;
}
