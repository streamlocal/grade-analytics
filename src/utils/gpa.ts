// Saint Ignatius High School GPA — quality-point table + level bumps.
// Source: school's published scale (user-provided).
//  - Percentage -> base quality points (100..65 table; <65 = 0)
//  - Honors +0.25, AP / dual-credit / AP-prerequisite +0.5, Regular +0
//  - "Free" (free period / non-credit) is EXCLUDED from GPA, not averaged as 0.
//  - No class rank is published; we show personal GPA only.

export type CourseLevel = 'Regular' | 'Honors' | 'AP' | 'Free';

// Effective grade = manual override (if set) else Canvas score.
export function effectiveScore(c: { current_score: number | null; score_override?: number | null }): number | null {
  return c.score_override ?? c.current_score;
}

// The school quality-point table uses whole percentages. Round the underlying
// Canvas value before lookup; .5 and above round up (not the displayed 1dp value).
const TABLE: Record<number, number> = {
  100: 4.3, 99: 4.3, 98: 4.3, 97: 4.2, 96: 4.1, 95: 4.0, 94: 3.9,
  93: 3.8, 92: 3.7, 91: 3.6, 90: 3.5, 89: 3.4, 88: 3.3, 87: 3.2,
  86: 3.1, 85: 3.0, 84: 2.9, 83: 2.8, 82: 2.7, 81: 2.6, 80: 2.5,
  79: 2.4, 78: 2.3, 77: 2.2, 76: 2.1, 75: 2.0, 74: 1.9, 73: 1.8,
  72: 1.7, 71: 1.6, 70: 1.5, 69: 1.4, 68: 1.3, 67: 1.2, 66: 1.1, 65: 1.0,
};

export function roundedGpaPercent(score: number | null | undefined): number | null {
  // Extra-credit scores still use the highest (100%) school-table row.
  return score == null || !Number.isFinite(score) ? null : Math.max(0, Math.min(100, Math.round(score)));
}

export function baseQualityPoints(score: number | null | undefined): number | null {
  const p = roundedGpaPercent(score);
  if (p == null) return null;
  if (p < 65) return 0; // failing grades get 0 quality points
  if (p >= 100) return TABLE[100];
  return TABLE[p] ?? null;
}

export function qualityPoints(score: number | null | undefined, level: CourseLevel): number | null {
  if (level === 'Free') return null; // excluded from GPA
  const base = baseQualityPoints(score);
  if (base == null) return null;
  if (base === 0) return 0; // failing stays 0, no bump
  if (level === 'Honors') return Math.round((base + 0.25) * 100) / 100;
  if (level === 'AP') return Math.round((base + 0.5) * 100) / 100;
  return base;
}

// Overall GPA = mean of per-class quality points, excluding Free + ungraded.
export function overallGpa(classes: { score: number | null; level: CourseLevel }[]): number | null {
  const pts = classes
    .map((c) => qualityPoints(c.score, c.level))
    .filter((p): p is number => p != null);
  if (!pts.length) return null;
  return Math.round((pts.reduce((a, b) => a + b, 0) / pts.length) * 1000) / 1000;
}

// Display-only letter estimates. The school assigns quality points from
// percentages and does not publish these +/- labels on report cards.
export function letterGrade(score: number | null | undefined): string {
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
