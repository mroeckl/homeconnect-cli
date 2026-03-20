import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HomeConnectService } from '../src/services/home-connect-service.js';
import { StateStore } from '../src/storage/state-store.js';

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('HomeConnectService appliance selector', () => {
  it('resolves appliance names and completes appliance names', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'hc-selector-'));
    cleanup.push(baseDir);

    const store = new StateStore(baseDir);
    await store.updateProfileConfig('production', 'production', {
      clientId: 'client-id',
    });
    await store.mutateProfile('production', 'production', (profile) => {
      profile.session = {
        accessToken: 'token',
        tokenType: 'Bearer',
      };
      profile.appliances = {
        'dishwasher-id': {
          appliance: {
            id: 'dishwasher-id',
            name: 'Dishy',
            connected: true,
          },
        },
        'oven-id': {
          appliance: {
            id: 'oven-id',
            name: 'Oven',
            connected: true,
          },
        },
      };
    });

    const service = new HomeConnectService({
      store,
      profileName: 'production',
      environment: 'production',
    });

    await expect(service.resolveApplianceSelector('Dishy')).resolves.toBe(
      'dishwasher-id',
    );

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'get',
        '--appliance',
        'Di',
      ]),
    ).resolves.toEqual(['Dishy']);
  });
});
