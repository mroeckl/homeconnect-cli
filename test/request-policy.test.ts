import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import { RequestPolicy } from '../src/services/request-policy.js';
import type { ProfileState } from '../src/types.js';

function createProfile(): ProfileState {
  return {
    profile: {
      name: 'production',
      environment: 'production',
    },
    appliances: {},
    rateLimit: {
      avoidableFailures: 0,
    },
  };
}

describe('RequestPolicy', () => {
  it('blocks during retry-after windows', () => {
    const policy = new RequestPolicy();
    const profile = createProfile();
    profile.rateLimit.retryAfter = new Date(Date.now() + 60_000).toISOString();
    expect(() => policy.ensureNotRateLimited(profile)).toThrowError(CliError);
  });

  it('stores retry-after timestamps from seconds', () => {
    const policy = new RequestPolicy();
    const profile = createProfile();
    policy.applyRateLimit(profile, '30');
    expect(profile.rateLimit.retryAfter).toBeTruthy();
    expect(profile.rateLimit.last429At).toBeTruthy();
  });
});
