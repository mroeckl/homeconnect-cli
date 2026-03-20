import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { HomeConnectClientPort } from '../src/services/home-connect-service.js';
import { HomeConnectService } from '../src/services/home-connect-service.js';
import { StateStore } from '../src/storage/state-store.js';

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('HomeConnectService token refresh', () => {
  it('refreshes expired tokens before API calls and persists the new session', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'hc-refresh-'));
    cleanup.push(baseDir);

    const store = new StateStore(baseDir);
    await store.updateProfileConfig('production', 'production', {
      clientId: 'client-id',
      clientSecret: 'client-secret',
    });
    await store.mutateProfile('production', 'production', (profile) => {
      profile.session = {
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() - 5_000).toISOString(),
      };
    });

    const service = new HomeConnectService({
      store,
      profileName: 'production',
      environment: 'production',
      clientFactory: (_profile, session) =>
        ({
          refreshAccessToken: async () => {
            refreshCalls += 1;
            return {
              access_token: 'fresh-token',
              refresh_token: 'fresh-refresh-token',
              token_type: 'Bearer',
              expires_in: 3600,
              scope: 'IdentifyAppliance Monitor Control Settings',
            };
          },
          listAppliances: async () => {
            listCalls += 1;
            expect(session?.accessToken).toBe('fresh-token');
            return [];
          },
        }) as HomeConnectClientPort,
    });

    let refreshCalls = 0;
    let listCalls = 0;

    await service.listAppliances();

    const profile = await store.requireSession('production', 'production');
    expect(refreshCalls).toBe(1);
    expect(listCalls).toBe(1);
    expect(profile.session?.accessToken).toBe('fresh-token');
    expect(profile.session?.refreshToken).toBe('fresh-refresh-token');
  });
});
