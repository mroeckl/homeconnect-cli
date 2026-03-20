import { CliError } from '../core/errors.js';
import { nowIso } from '../core/time.js';
import type { ProfileState } from '../types.js';

export class RequestPolicy {
  ensureNotRateLimited(profile: ProfileState): void {
    const retryAfter = profile.rateLimit.retryAfter;
    if (!retryAfter) {
      return;
    }

    if (Date.now() < new Date(retryAfter).getTime()) {
      throw new CliError(
        'RATE_LIMITED',
        'Profile is temporarily rate limited',
        { retryAfter },
      );
    }
  }

  applyRateLimit(
    profile: ProfileState,
    retryAfterHeader?: string | null,
  ): void {
    let retryAt: Date | undefined;
    if (retryAfterHeader) {
      if (/^\d+$/.test(retryAfterHeader)) {
        retryAt = new Date(
          Date.now() + Number.parseInt(retryAfterHeader, 10) * 1000,
        );
      } else {
        retryAt = new Date(retryAfterHeader);
      }
    }

    profile.rateLimit.retryAfter = retryAt?.toISOString();
    profile.rateLimit.last429At = nowIso();
    profile.rateLimit.lastError = '429';
  }

  registerAvoidableFailure(profile: ProfileState, code: string): void {
    profile.rateLimit.avoidableFailures += 1;
    profile.rateLimit.lastError = code;
  }
}
