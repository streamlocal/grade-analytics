import { createContext, useContext } from 'react';

export const betaFeatures = [
  { id: 'changes', name: 'What changed?', description: 'See a concise before-and-after summary after a sync.' },
  { id: 'freshness', name: 'Data freshness', description: 'See when saved grades and assignments were checked and when a refresh failed.' },
  { id: 'impact', name: 'Grade-impact preview', description: 'Preview possible assignment scores without changing real grades.' },
  { id: 'planner', name: 'Weekly planner', description: 'Plan this week with due work, Canvas events, and personal reminders.' },
  { id: 'priorities', name: 'Assignment priorities', description: 'Sort by urgency, points, effort, and priorities you set.' },
  { id: 'explanations', name: 'Grade-change explanations', description: 'Show likely assignments behind a course-grade movement.' },
  { id: 'goals', name: 'Goals and thresholds', description: 'Track course and GPA targets and see at-risk warnings.' },
  { id: 'notifications', name: 'Notifications and digest', description: 'Opt into a bundled browser alert for relevant updates.' },
  { id: 'activity', name: 'Activity controls', description: 'Filter, search, and undo acknowledged activity.' },
  { id: 'offline', name: 'Offline saved view', description: 'Keep a clearly labeled copy of grades and assignments on this device.' },
] as const;

export type BetaFeature = typeof betaFeatures[number]['id'];
export type BetaFlags = Record<BetaFeature, boolean>;
export const defaultBetaFlags = Object.fromEntries(betaFeatures.map(({ id }) => [id, false])) as BetaFlags;

export function parseBetaFlags(value: unknown): BetaFlags {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return Object.fromEntries(betaFeatures.map(({ id }) => [id, source[id] === true])) as BetaFlags;
}

export const BetaContext = createContext<BetaFlags>(defaultBetaFlags);
export const useBeta = () => useContext(BetaContext);
