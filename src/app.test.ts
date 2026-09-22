import { describe, it, expect } from 'vitest';
import { letterFor, fmtPct, delta } from './utils/format';
import { baseQualityPoints, qualityPoints, overallGpa, letterGrade } from './utils/gpa';

describe('grading utils', () => {
  it('letter grades', () => {
    expect(letterFor(95)).toBe('A');
    expect(letterFor(null)).toBe('—');
  });
  it('formats pct', () => {
    expect(fmtPct(91.44)).toBe('91.4%');
    expect(fmtPct(null)).toBe('—');
  });
  it('delta math', () => {
    expect(delta(89.7, 91.2)).toBeCloseTo(1.5);
  });
});

describe('Ignatius GPA', () => {
  it('quality point table', () => {
    expect(baseQualityPoints(100)).toBe(4.3);
    expect(baseQualityPoints(95)).toBe(4.0);
    expect(baseQualityPoints(90)).toBe(3.5);
    expect(baseQualityPoints(83)).toBe(2.8);
    expect(baseQualityPoints(65)).toBe(1.0);
    expect(baseQualityPoints(64.9)).toBe(0);
    expect(baseQualityPoints(null)).toBe(null);
  });
  it('level bumps', () => {
    expect(qualityPoints(95, 'Regular')).toBe(4.0);
    expect(qualityPoints(95, 'Honors')).toBe(4.25);
    expect(qualityPoints(95, 'AP')).toBe(4.5);
    expect(qualityPoints(50, 'AP')).toBe(0); // failing stays 0
    expect(qualityPoints(95, 'Free')).toBe(null); // excluded
  });
  it('overall GPA excludes Free + ungraded', () => {
    expect(overallGpa([
      { score: 95, level: 'Regular' }, // 4.0
      { score: 95, level: 'AP' },      // 4.5
      { score: 90, level: 'Free' },    // excluded
      { score: null, level: 'Regular' }, // excluded
    ])).toBe(4.25);
  });
  it('letters A+ to D-', () => {
    expect(letterGrade(98)).toBe('A+');
    expect(letterGrade(95)).toBe('A');
    expect(letterGrade(91)).toBe('A−');
    expect(letterGrade(85)).toBe('B');
    expect(letterGrade(72)).toBe('C−');
    expect(letterGrade(65)).toBe('D−');
    expect(letterGrade(64)).toBe('F');
  });
});
