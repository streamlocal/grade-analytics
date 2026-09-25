import { describe, expect, it } from 'vitest';
import { betaFeatures, parseBetaFlags } from './beta';

describe('beta preferences', () => {
  it('starts every feature off for new accounts', () => {
    const flags = parseBetaFlags(undefined);
    expect(betaFeatures).toHaveLength(10);
    expect(Object.values(flags).every((enabled) => enabled === false)).toBe(true);
  });
  it('only enables explicit true values from known feature names', () => {
    const flags = parseBetaFlags({ planner: true, goals: 'true', unlisted: true });
    expect(flags.planner).toBe(true);
    expect(flags.goals).toBe(false);
    expect('unlisted' in flags).toBe(false);
  });
});
