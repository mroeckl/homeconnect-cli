import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HomeConnectClientPort } from '../src/services/home-connect-service.js';
import { HomeConnectService } from '../src/services/home-connect-service.js';
import { StateStore } from '../src/storage/state-store.js';

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
  vi.restoreAllMocks();
});

type ClientFactory = () => HomeConnectClientPort;

async function createService(clientFactory?: ClientFactory) {
  const baseDir = await mkdtemp(join(tmpdir(), 'hc-service-'));
  cleanup.push(baseDir);

  const store = new StateStore(baseDir);
  await store.updateProfileConfig('production', 'production', {
    clientId: 'client-id',
    clientSecret: 'client-secret',
  });
  await store.mutateProfile('production', 'production', (profile) => {
    profile.session = {
      accessToken: 'token',
      tokenType: 'Bearer',
    };
  });

  const service = new HomeConnectService({
    store,
    profileName: 'production',
    environment: 'production',
    clientFactory: clientFactory
      ? (_profile, _session, _options) => clientFactory()
      : undefined,
  });

  return { service, store };
}

describe('HomeConnectService flows', () => {
  it('lists status for all connected appliances only', async () => {
    const { service } = await createService(
      () =>
        ({
          listAppliances: async () => [
            { id: 'dishy-id', name: 'Dishy', connected: true },
            { id: 'oven-id', name: 'Oven', connected: false },
          ],
          listStatus: async (applianceId: string) => [
            { key: `${applianceId}.Status`, value: 'Ready' },
          ],
        }) as HomeConnectClientPort,
    );

    await expect(service.listAllStatuses()).resolves.toEqual([
      {
        applianceId: 'dishy-id',
        applianceName: 'Dishy',
        items: [{ key: 'dishy-id.Status', value: 'Ready' }],
      },
    ]);
  });

  it('parses setting assignments and sends typed values', async () => {
    const setSetting = vi.fn(async () => undefined);
    const { service } = await createService(
      () =>
        ({
          listAppliances: async () => [
            { id: 'dishy-id', name: 'Dishy', connected: true },
          ],
          listSettings: async () => [
            { key: 'BSH.Common.Setting.PowerState', value: 'Off' },
            { key: 'Dishcare.Custom.Setting.ProgramTimeout', value: 15 },
          ],
          setSetting,
        }) as HomeConnectClientPort,
    );

    await service.setSettings('dishy-id', [
      'BSH.Common.Setting.PowerState=true',
      'Dishcare.Custom.Setting.ProgramTimeout=30',
    ]);

    expect(setSetting).toHaveBeenNthCalledWith(1, 'dishy-id', {
      key: 'BSH.Common.Setting.PowerState',
      value: true,
    });
    expect(setSetting).toHaveBeenNthCalledWith(2, 'dishy-id', {
      key: 'Dishcare.Custom.Setting.ProgramTimeout',
      value: 30,
    });
  });

  it('starts a program via validated select plus start', async () => {
    const selectProgram = vi.fn(async () => undefined);
    const startProgram = vi.fn(async () => undefined);
    const { service, store } = await createService(
      () =>
        ({
          listAppliances: async () => [
            { id: 'dishy-id', name: 'Dishy', connected: true },
          ],
          listPrograms: async () => [
            {
              key: 'Dishcare.Dishwasher.Program.Eco50',
              name: 'Eco 50',
            },
          ],
          getProgram: async () => ({
            key: 'Dishcare.Dishwasher.Program.Eco50',
            name: 'Eco 50',
            options: [
              {
                key: 'Dishcare.Dishwasher.Option.ExtraDry',
                constraints: {
                  allowedvalues: [true, false],
                },
              },
            ],
          }),
          selectProgram,
          startProgram,
        }) as HomeConnectClientPort,
    );

    await service.startProgram(
      'dishy-id',
      'Dishcare.Dishwasher.Program.Eco50',
      ['Dishcare.Dishwasher.Option.ExtraDry=true'],
    );

    expect(selectProgram).toHaveBeenCalledWith(
      'dishy-id',
      'Dishcare.Dishwasher.Program.Eco50',
      [{ key: 'Dishcare.Dishwasher.Option.ExtraDry', value: true }],
    );
    expect(startProgram).toHaveBeenCalledWith(
      'dishy-id',
      'Dishcare.Dishwasher.Program.Eco50',
      [{ key: 'Dishcare.Dishwasher.Option.ExtraDry', value: true }],
    );

    const profile = await store.requireSession('production', 'production');
    expect(profile.appliances['dishy-id']?.selectedProgram?.key).toBe(
      'Dishcare.Dishwasher.Program.Eco50',
    );
  });

  it('starts the currently selected program with writable selected options only', async () => {
    const startProgram = vi.fn(async () => undefined);
    const getSelectedProgram = vi.fn(async () => ({
      key: 'Dishcare.Dishwasher.Program.Eco50',
      name: 'Eco 50',
      options: [
        {
          key: 'Dishcare.Dishwasher.Option.ExtraDry',
          value: true,
        },
        {
          key: 'Dishcare.Dishwasher.Option.ProgramProgress',
          value: 12,
        },
      ],
    }));
    const getProgram = vi.fn(async () => ({
      key: 'Dishcare.Dishwasher.Program.Eco50',
      name: 'Eco 50',
      options: [
        {
          key: 'Dishcare.Dishwasher.Option.ExtraDry',
          constraints: {
            allowedvalues: [true, false],
          },
        },
      ],
    }));
    const { service } = await createService(
      () =>
        ({
          listAppliances: async () => [
            { id: 'dishy-id', name: 'Dishy', connected: true },
          ],
          getSelectedProgram,
          listPrograms: async () => [
            {
              key: 'Dishcare.Dishwasher.Program.Eco50',
              name: 'Eco 50',
            },
          ],
          getProgram,
          startProgram,
        }) as HomeConnectClientPort,
    );

    await service.startProgram('dishy-id');

    expect(getSelectedProgram).toHaveBeenCalledWith('dishy-id');
    expect(getProgram).toHaveBeenCalledWith(
      'dishy-id',
      'Dishcare.Dishwasher.Program.Eco50',
    );
    expect(startProgram).toHaveBeenCalledWith(
      'dishy-id',
      'Dishcare.Dishwasher.Program.Eco50',
      [
        {
          key: 'Dishcare.Dishwasher.Option.ExtraDry',
          value: true,
        },
      ],
    );
  });

  it('updates the currently selected program without reselecting it', async () => {
    const setSelectedOption = vi.fn(async () => undefined);
    const { service } = await createService(
      () =>
        ({
          listAppliances: async () => [
            { id: 'dishy-id', name: 'Dishy', connected: true },
          ],
          getSelectedProgram: async () => ({
            key: 'Dishcare.Dishwasher.Program.Eco50',
            name: 'Eco 50',
            options: [
              {
                key: 'Dishcare.Dishwasher.Option.ExtraDry',
                constraints: {
                  allowedvalues: [true, false],
                },
              },
            ],
          }),
          setSelectedOption,
        }) as HomeConnectClientPort,
    );

    await service.setSelectedProgram('dishy-id', undefined, [
      'Dishcare.Dishwasher.Option.ExtraDry=true',
    ]);

    expect(setSelectedOption).toHaveBeenCalledWith('dishy-id', {
      key: 'Dishcare.Dishwasher.Option.ExtraDry',
      value: true,
    });
  });

  it('updates several selected-program options sequentially via the option endpoint', async () => {
    const setSelectedOption = vi.fn(async () => undefined);
    const { service } = await createService(
      () =>
        ({
          listAppliances: async () => [
            { id: 'dishy-id', name: 'Dishy', connected: true },
          ],
          getSelectedProgram: async () => ({
            key: 'Dishcare.Dishwasher.Program.Eco50',
            name: 'Eco 50',
            options: [
              {
                key: 'Dishcare.Dishwasher.Option.ExtraDry',
                constraints: {
                  allowedvalues: [true, false],
                },
              },
              {
                key: 'Dishcare.Dishwasher.Option.HygienePlus',
                constraints: {
                  allowedvalues: [true, false],
                },
              },
            ],
          }),
          listPrograms: async () => [
            {
              key: 'Dishcare.Dishwasher.Program.Eco50',
              name: 'Eco 50',
            },
          ],
          getProgram: async () => ({
            key: 'Dishcare.Dishwasher.Program.Eco50',
            name: 'Eco 50',
            options: [
              {
                key: 'Dishcare.Dishwasher.Option.ExtraDry',
                constraints: {
                  allowedvalues: [true, false],
                },
              },
              {
                key: 'Dishcare.Dishwasher.Option.HygienePlus',
                constraints: {
                  allowedvalues: [true, false],
                },
              },
            ],
          }),
          setSelectedOption,
        }) as HomeConnectClientPort,
    );

    await service.setSelectedProgram('dishy-id', undefined, [
      'Dishcare.Dishwasher.Option.ExtraDry=true',
      'Dishcare.Dishwasher.Option.HygienePlus=false',
    ]);

    expect(setSelectedOption).toHaveBeenNthCalledWith(1, 'dishy-id', {
      key: 'Dishcare.Dishwasher.Option.ExtraDry',
      value: true,
    });
    expect(setSelectedOption).toHaveBeenNthCalledWith(2, 'dishy-id', {
      key: 'Dishcare.Dishwasher.Option.HygienePlus',
      value: false,
    });
  });

  it('updates the active program via the active endpoint with an explicit program', async () => {
    const setActiveProgram = vi.fn(async () => undefined);
    const { service } = await createService(
      () =>
        ({
          listAppliances: async () => [
            { id: 'oven-id', name: 'Oven', connected: true },
          ],
          listPrograms: async () => [
            {
              key: 'Cooking.Oven.Program.HeatingMode.HotAir',
              name: 'Hot air',
            },
          ],
          getProgram: async () => ({
            key: 'Cooking.Oven.Program.HeatingMode.HotAir',
            name: 'Hot air',
            options: [
              {
                key: 'Cooking.Oven.Option.SetpointTemperature',
                constraints: {
                  min: 30,
                  max: 275,
                },
              },
            ],
          }),
          setActiveProgram,
        }) as HomeConnectClientPort,
    );

    await service.setActiveProgram(
      'oven-id',
      'Cooking.Oven.Program.HeatingMode.HotAir',
      ['Cooking.Oven.Option.SetpointTemperature=180'],
    );

    expect(setActiveProgram).toHaveBeenCalledWith(
      'oven-id',
      'Cooking.Oven.Program.HeatingMode.HotAir',
      [{ key: 'Cooking.Oven.Option.SetpointTemperature', value: 180 }],
    );
  });

  it('updates several active-program options sequentially via the option endpoint', async () => {
    const setActiveOption = vi.fn(async () => undefined);
    const { service } = await createService(
      () =>
        ({
          listAppliances: async () => [
            { id: 'oven-id', name: 'Oven', connected: true },
          ],
          getActiveProgram: async () => ({
            key: 'Cooking.Oven.Program.HeatingMode.HotAir',
            name: 'Hot air',
            options: [
              {
                key: 'Cooking.Oven.Option.SetpointTemperature',
                constraints: {
                  min: 30,
                  max: 275,
                },
              },
              {
                key: 'BSH.Common.Option.StartInRelative',
                constraints: {
                  allowedvalues: [0, 3600],
                },
              },
            ],
          }),
          listPrograms: async () => [
            {
              key: 'Cooking.Oven.Program.HeatingMode.HotAir',
              name: 'Hot air',
            },
          ],
          getProgram: async () => ({
            key: 'Cooking.Oven.Program.HeatingMode.HotAir',
            name: 'Hot air',
            options: [
              {
                key: 'Cooking.Oven.Option.SetpointTemperature',
                constraints: {
                  min: 30,
                  max: 275,
                },
              },
              {
                key: 'BSH.Common.Option.StartInRelative',
                constraints: {
                  allowedvalues: [0, 3600],
                },
              },
            ],
          }),
          setActiveOption,
        }) as HomeConnectClientPort,
    );

    await service.setActiveProgram('oven-id', undefined, [
      'Cooking.Oven.Option.SetpointTemperature=180',
      'BSH.Common.Option.StartInRelative=3600',
    ]);

    expect(setActiveOption).toHaveBeenNthCalledWith(1, 'oven-id', {
      key: 'Cooking.Oven.Option.SetpointTemperature',
      value: 180,
    });
    expect(setActiveOption).toHaveBeenNthCalledWith(2, 'oven-id', {
      key: 'BSH.Common.Option.StartInRelative',
      value: 3600,
    });
  });

  it('allows activating a program without options via the active endpoint', async () => {
    const setActiveProgram = vi.fn(async () => undefined);
    const { service } = await createService(
      () =>
        ({
          listAppliances: async () => [
            { id: 'oven-id', name: 'Oven', connected: true },
          ],
          listPrograms: async () => [
            {
              key: 'Cooking.Oven.Program.HeatingMode.HotAir',
              name: 'Hot air',
            },
          ],
          getProgram: async () => ({
            key: 'Cooking.Oven.Program.HeatingMode.HotAir',
            name: 'Hot air',
            options: [],
          }),
          setActiveProgram,
        }) as HomeConnectClientPort,
    );

    await service.setActiveProgram(
      'oven-id',
      'Cooking.Oven.Program.HeatingMode.HotAir',
      [],
    );

    expect(setActiveProgram).toHaveBeenCalledWith(
      'oven-id',
      'Cooking.Oven.Program.HeatingMode.HotAir',
      [],
    );
  });

  it('requires --program for active program updates', async () => {
    const setActiveOption = vi.fn(async () => undefined);
    const { service } = await createService(
      () =>
        ({
          listAppliances: async () => [
            { id: 'oven-id', name: 'Oven', connected: true },
          ],
          getActiveProgram: async () => ({
            key: 'Cooking.Oven.Program.HeatingMode.HotAir',
            name: 'Hot air',
            options: [
              {
                key: 'Cooking.Oven.Option.SetpointTemperature',
                constraints: {
                  min: 30,
                  max: 275,
                },
              },
            ],
          }),
          listPrograms: async () => [
            {
              key: 'Cooking.Oven.Program.HeatingMode.HotAir',
              name: 'Hot air',
            },
          ],
          getProgram: async () => ({
            key: 'Cooking.Oven.Program.HeatingMode.HotAir',
            name: 'Hot air',
            options: [
              {
                key: 'Cooking.Oven.Option.SetpointTemperature',
                constraints: {
                  min: 30,
                  max: 275,
                },
              },
            ],
          }),
          setActiveOption,
        }) as HomeConnectClientPort,
    );

    await service.setActiveProgram('oven-id', undefined, [
      'Cooking.Oven.Option.SetpointTemperature=180',
    ]);

    expect(setActiveOption).toHaveBeenCalledWith('oven-id', {
      key: 'Cooking.Oven.Option.SetpointTemperature',
      value: 180,
    });
  });

  it('builds a merged interactive selected-program view and excludes active-only timing options', async () => {
    const selectProgram = vi.fn(async () => undefined);
    const { service } = await createService(
      () =>
        ({
          listAppliances: async () => [
            { id: 'dishy-id', name: 'Dishy', connected: true },
          ],
          listPrograms: async () => [
            {
              key: 'Dishcare.Dishwasher.Program.Auto2',
              name: 'Auto 2',
            },
          ],
          getProgram: async () => ({
            key: 'Dishcare.Dishwasher.Program.Auto2',
            name: 'Auto 2',
            options: [
              {
                key: 'BSH.Common.Option.StartInRelative',
                name: 'Start in relative',
                constraints: { min: 0, max: 86400 },
              },
              {
                key: 'Dishcare.Dishwasher.Option.ExtraDry',
                name: 'Extra dry',
                constraints: { allowedvalues: [true, false] },
              },
            ],
          }),
          getSelectedProgram: async () => ({
            key: 'Dishcare.Dishwasher.Program.Auto2',
            name: 'Auto 2',
            options: [
              {
                key: 'Dishcare.Dishwasher.Option.ExtraDry',
                value: true,
                displayvalue: 'On',
              },
            ],
          }),
          selectProgram,
        }) as HomeConnectClientPort,
    );

    const result = await service.getInteractiveProgramView(
      'dishy-id',
      'selected',
      'Dishcare.Dishwasher.Program.Auto2',
    );

    expect(selectProgram).toHaveBeenCalledWith(
      'dishy-id',
      'Dishcare.Dishwasher.Program.Auto2',
      [],
    );
    expect(result.key).toBe('Dishcare.Dishwasher.Program.Auto2');
    expect(result.options).toEqual([
      {
        key: 'Dishcare.Dishwasher.Option.ExtraDry',
        name: 'Extra dry',
        constraints: { allowedvalues: [true, false] },
        value: true,
        displayvalue: 'On',
        unit: undefined,
        type: undefined,
      },
    ]);
  });

  it('builds a merged interactive active-program view and keeps active-only timing options', async () => {
    const setActiveProgram = vi.fn(async () => undefined);
    const { service } = await createService(
      () =>
        ({
          listAppliances: async () => [
            { id: 'dishy-id', name: 'Dishy', connected: true },
          ],
          listPrograms: async () => [
            {
              key: 'Dishcare.Dishwasher.Program.Auto2',
              name: 'Auto 2',
            },
          ],
          getProgram: async () => ({
            key: 'Dishcare.Dishwasher.Program.Auto2',
            name: 'Auto 2',
            options: [
              {
                key: 'BSH.Common.Option.StartInRelative',
                name: 'Start in relative',
                constraints: { min: 0, max: 86400 },
              },
            ],
          }),
          getActiveProgram: async () => ({
            key: 'Dishcare.Dishwasher.Program.Auto2',
            name: 'Auto 2',
            options: [
              {
                key: 'BSH.Common.Option.StartInRelative',
                value: 3600,
                displayvalue: '1 h',
              },
            ],
          }),
          setActiveProgram,
        }) as HomeConnectClientPort,
    );

    const result = await service.getInteractiveProgramView(
      'dishy-id',
      'active',
      'Dishcare.Dishwasher.Program.Auto2',
    );

    expect(setActiveProgram).toHaveBeenCalledWith(
      'dishy-id',
      'Dishcare.Dishwasher.Program.Auto2',
      [],
    );
    expect(result.options).toEqual([
      {
        key: 'BSH.Common.Option.StartInRelative',
        name: 'Start in relative',
        constraints: { min: 0, max: 86400 },
        value: 3600,
        displayvalue: '1 h',
        unit: undefined,
        type: undefined,
      },
    ]);
  });
});
