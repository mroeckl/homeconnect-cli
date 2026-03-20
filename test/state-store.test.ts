import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { CliError } from '../src/core/errors.js';
import { StateStore } from '../src/storage/state-store.js';

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('StateStore', () => {
  it('creates and persists profile state', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'hc-state-'));
    cleanup.push(baseDir);
    const store = new StateStore(baseDir);

    await store.updateProfileConfig('production', 'production', {
      clientId: 'client-id',
    });
    const profile = await store.getProfile('production', 'production');

    expect(profile.profile.clientId).toBe('client-id');
    expect(profile.rateLimit.avoidableFailures).toBe(0);
  });

  it('persists profile language', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'hc-state-'));
    cleanup.push(baseDir);
    const store = new StateStore(baseDir);

    await store.updateProfileConfig('production', 'production', {
      language: 'de-DE',
    });
    const profile = await store.getProfile('production', 'production');

    expect(profile.profile.language).toBe('de-DE');
  });

  it('migrates legacy defaultOutput to output', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'hc-state-'));
    cleanup.push(baseDir);
    await writeFile(
      join(baseDir, 'state.json'),
      JSON.stringify({
        profiles: {
          production: {
            profile: {
              name: 'production',
              environment: 'production',
              defaultOutput: 'json',
            },
            appliances: {},
            rateLimit: {
              avoidableFailures: 0,
            },
          },
        },
      }),
    );
    const store = new StateStore(baseDir);

    const profile = await store.getProfile('production', 'production');

    expect(profile.profile.output).toBe('json');
    expect(
      'defaultOutput' in
        (profile.profile as typeof profile.profile & Record<string, unknown>),
    ).toBe(false);
  });

  it('reports invalid state files with a dedicated error', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'hc-state-'));
    cleanup.push(baseDir);
    await writeFile(
      join(baseDir, 'state.json'),
      '{\n  "profiles": {}\n}\ntrailing-junk\n',
      'utf8',
    );
    const store = new StateStore(baseDir);

    await expect(store.load()).rejects.toMatchObject({
      code: 'STATE_FILE_INVALID',
      message: `State file is invalid JSON: ${join(baseDir, 'state.json')}`,
      details: {
        path: join(baseDir, 'state.json'),
      },
    } satisfies Partial<CliError>);
  });
});
