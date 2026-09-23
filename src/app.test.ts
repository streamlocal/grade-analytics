import { describe, it, expect } from 'vitest';
import { letterFor, fmtPct, delta } from './utils/format';
import { baseQualityPoints, qualityPoints, overallGpa, letterGrade, roundedGpaPercent } from './utils/gpa';

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
    expect(baseQualityPoints(64.49)).toBe(0);
    expect(baseQualityPoints(null)).toBe(null);
  });
  it('rounds Canvas percentages before school-table lookup, with .5 up', () => {
    expect(roundedGpaPercent(80.49)).toBe(80);
    expect(roundedGpaPercent(80.5)).toBe(81);
    expect(roundedGpaPercent(80.9)).toBe(81);
    expect(roundedGpaPercent(105.7)).toBe(100);
    expect(baseQualityPoints(80.49)).toBe(2.5);
    expect(baseQualityPoints(80.5)).toBe(2.6);
    expect(qualityPoints(80.9, 'AP')).toBe(3.1);
    expect(qualityPoints(97.49, 'AP')).toBe(4.7);
    expect(qualityPoints(97.5, 'AP')).toBe(4.8);
    expect(baseQualityPoints(64.5)).toBe(1.0);
  });
  it('matches the six whole-percent grades in the school calculator', () => {
    expect(overallGpa([
      { score: 97, level: 'AP' },
      { score: 90, level: 'AP' },
      { score: null, level: 'Free' },
      { score: 98, level: 'Honors' },
      { score: 100, level: 'Regular' },
      { score: 81, level: 'AP' },
      { score: 99, level: 'Honors' },
    ])).toBe(4.2);
  });
  it('keeps the Canvas and semester-grade inputs distinct', () => {
    const otherCourses = [
      { score: 90.3, level: 'AP' as const },
      { score: 98.3, level: 'Honors' as const },
      { score: 100, level: 'Regular' as const },
      { score: 80.9, level: 'AP' as const },
      { score: 99.1, level: 'Honors' as const },
    ];
    expect(overallGpa([{ score: 97.5, level: 'AP' }, ...otherCourses])).toBe(4.217);
    expect(overallGpa([{ score: 97.49, level: 'AP' }, ...otherCourses])).toBe(4.2);
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
