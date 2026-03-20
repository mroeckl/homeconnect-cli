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

describe('HomeConnectService completion matching', () => {
  it('matches programs, options, and settings by segment and suffix fragments', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'hc-completion-'));
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
        'coffee-id': {
          appliance: {
            id: 'coffee-id',
            name: 'Coffee',
            connected: true,
          },
          settings: [
            {
              key: 'BSH.Common.Setting.PowerState',
              name: 'Power state',
              displayvalue: 'On',
            },
          ],
          settingDetails: {
            'BSH.Common.Setting.PowerState': {
              key: 'BSH.Common.Setting.PowerState',
              name: 'Power state',
              constraints: {
                allowedvalues: [
                  'BSH.Common.EnumType.PowerState.On',
                  'BSH.Common.EnumType.PowerState.Off',
                ],
              },
            },
          },
          availablePrograms: [
            {
              key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
              name: 'Espresso',
            },
          ],
          programDetails: {
            'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso': {
              key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
              name: 'Espresso',
              options: [
                {
                  key: 'BSH.Common.Option.StartInRelative',
                  name: 'Start in relative',
                  constraints: {
                    allowedvalues: [0, 3600],
                  },
                },
                {
                  key: 'BSH.Common.Option.FinishInRelative',
                  name: 'Finish in relative',
                  constraints: {
                    allowedvalues: [0, 3600],
                  },
                },
                {
                  key: 'ConsumerProducts.CoffeeMaker.Option.CoffeeStrength',
                  name: 'Coffee strength',
                },
                {
                  key: 'Dishcare.Dishwasher.Option.ExtraDry',
                  name: 'Extra dry',
                  constraints: {
                    allowedvalues: [true, false],
                  },
                },
              ],
            },
          },
          selectedProgram: {
            key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
            name: 'Espresso',
            options: [
              {
                key: 'Dishcare.Dishwasher.Option.ExtraDry',
                name: 'Extra dry',
                constraints: {
                  allowedvalues: [true, false],
                },
              },
            ],
          },
          activeProgram: {
            key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
            name: 'Espresso',
            options: [
              {
                key: 'Dishcare.Dishwasher.Option.ExtraDry',
                name: 'Extra dry',
                constraints: {
                  allowedvalues: [true, false],
                },
              },
            ],
          },
        },
      };
    });

    const service = new HomeConnectService({
      store,
      profileName: 'production',
      environment: 'production',
    });

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'get',
        '--appliance',
        'coffee-id',
        '--program',
        'Espresso',
      ]),
    ).resolves.toEqual([
      'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
    ]);

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'get',
        '--appliance',
        'coffee-id',
        '--program',
        'ConsumerProducts.CoffeeMaker.Program.Es',
      ]),
    ).resolves.toEqual([
      'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
    ]);

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'selected',
        'set',
        '--appliance',
        'coffee-id',
        '--program',
        'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
        '--option',
        'ExtraDry',
      ]),
    ).resolves.toEqual([
      'Dishcare.Dishwasher.Option.ExtraDry=true',
      'Dishcare.Dishwasher.Option.ExtraDry=false',
    ]);

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'selected',
        'set',
        '--appliance',
        'coffee-id',
        '--program',
        'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
        '--option',
        'ExtraDry=t',
      ]),
    ).resolves.toEqual(['Dishcare.Dishwasher.Option.ExtraDry=true']);

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'selected',
        'set',
        '--appliance',
        'coffee-id',
        '--program',
        'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
        '--option',
        'StartInRelative',
      ]),
    ).resolves.toEqual([]);

    await expect(
      service.completionSuggestions([
        'hc',
        'setting',
        'set',
        '--appliance',
        'coffee-id',
        '--setting',
        'PowerState',
      ]),
    ).resolves.toEqual([
      'BSH.Common.Setting.PowerState=BSH.Common.EnumType.PowerState.On',
      'BSH.Common.Setting.PowerState=BSH.Common.EnumType.PowerState.Off',
    ]);

    await expect(
      service.completionSuggestions([
        'hc',
        'setting',
        'set',
        '--appliance',
        'coffee-id',
        '--setting',
        'BSH.Common.Setting.PowerState=Of',
      ]),
    ).resolves.toEqual([
      'BSH.Common.Setting.PowerState=BSH.Common.EnumType.PowerState.Off',
    ]);

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'selected',
        'set',
        '--appliance',
        'coffee-id',
        '--option',
        'ExtraDry',
      ]),
    ).resolves.toEqual([
      'Dishcare.Dishwasher.Option.ExtraDry=true',
      'Dishcare.Dishwasher.Option.ExtraDry=false',
    ]);

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'active',
        'set',
        '--appliance',
        'coffee-id',
        '--program',
        'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
        '--option',
        'ExtraDry=t',
      ]),
    ).resolves.toEqual(['Dishcare.Dishwasher.Option.ExtraDry=true']);

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'active',
        'set',
        '--appliance',
        'coffee-id',
        '--program',
        'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
        '--option',
        'StartInRelative',
      ]),
    ).resolves.toEqual([
      'BSH.Common.Option.StartInRelative=0',
      'BSH.Common.Option.StartInRelative=3600',
    ]);
  });

  it('loads available programs lazily for program completion when the cache is empty', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'hc-program-completion-'));
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
        'coffee-id': {
          appliance: {
            id: 'coffee-id',
            name: 'Coffee',
            connected: true,
          },
          settings: [],
          settingDetails: {},
          availablePrograms: [],
          programDetails: {},
        },
      };
    });

    const service = new HomeConnectService({
      store,
      profileName: 'production',
      environment: 'production',
      clientFactory: () =>
        ({
          listAppliances: async () => [
            {
              id: 'coffee-id',
              name: 'Coffee',
              connected: true,
            },
          ],
          listPrograms: async () => [
            {
              key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
              name: 'Espresso',
            },
          ],
        }) as HomeConnectClientPort,
    });

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'selected',
        'set',
        '--appliance',
        'coffee-id',
        '--program',
        '',
      ]),
    ).resolves.toEqual([
      'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
    ]);
  });

  it('loads program details lazily for exact option key completion', async () => {
    const baseDir = await mkdtemp(
      join(tmpdir(), 'hc-program-detail-completion-'),
    );
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
        'coffee-id': {
          appliance: {
            id: 'coffee-id',
            name: 'Coffee',
            connected: true,
          },
          settings: [],
          settingDetails: {},
          availablePrograms: [
            {
              key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.CaffeLatte',
              name: 'Caffe Latte',
            },
          ],
          programDetails: {},
        },
      };
    });

    const service = new HomeConnectService({
      store,
      profileName: 'production',
      environment: 'production',
      clientFactory: () =>
        ({
          listAppliances: async () => [
            {
              id: 'coffee-id',
              name: 'Coffee',
              connected: true,
            },
          ],
          listPrograms: async () => [
            {
              key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.CaffeLatte',
              name: 'Caffe Latte',
            },
          ],
          getProgram: async () => ({
            key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.CaffeLatte',
            name: 'Caffe Latte',
            options: [
              {
                key: 'ConsumerProducts.CoffeeMaker.Option.BeanAmount',
                name: 'Bean Amount',
                constraints: {
                  allowedvalues: [
                    'ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Mild',
                    'ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Normal',
                  ],
                },
              },
            ],
          }),
        }) as HomeConnectClientPort,
    });

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'selected',
        'set',
        '--appliance',
        'coffee-id',
        '--program',
        'ConsumerProducts.CoffeeMaker.Program.Beverage.CaffeLatte',
        '--option',
        'ConsumerProducts.CoffeeMaker.Option.BeanAmount',
      ]),
    ).resolves.toEqual([
      'ConsumerProducts.CoffeeMaker.Option.BeanAmount=ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Mild',
      'ConsumerProducts.CoffeeMaker.Option.BeanAmount=ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Normal',
    ]);
  });

  it('loads available detail for the currently selected program when completing option values without --program', async () => {
    const baseDir = await mkdtemp(
      join(tmpdir(), 'hc-selected-detail-completion-'),
    );
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
        'coffee-id': {
          appliance: {
            id: 'coffee-id',
            name: 'Coffee',
            connected: true,
          },
          settings: [],
          settingDetails: {},
          availablePrograms: [
            {
              key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.CaffeLatte',
              name: 'Caffe Latte',
            },
          ],
          programDetails: {},
          selectedProgram: {
            key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.CaffeLatte',
            name: 'Caffe Latte',
            options: [
              {
                key: 'ConsumerProducts.CoffeeMaker.Option.BeanAmount',
                name: 'Bean Amount',
              },
            ],
          },
        },
      };
    });

    const service = new HomeConnectService({
      store,
      profileName: 'production',
      environment: 'production',
      clientFactory: () =>
        ({
          listAppliances: async () => [
            {
              id: 'coffee-id',
              name: 'Coffee',
              connected: true,
            },
          ],
          listPrograms: async () => [
            {
              key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.CaffeLatte',
              name: 'Caffe Latte',
            },
          ],
          getProgram: async () => ({
            key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.CaffeLatte',
            name: 'Caffe Latte',
            options: [
              {
                key: 'ConsumerProducts.CoffeeMaker.Option.BeanAmount',
                name: 'Bean Amount',
                constraints: {
                  allowedvalues: [
                    'ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Mild',
                    'ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Normal',
                  ],
                },
              },
            ],
          }),
        }) as HomeConnectClientPort,
    });

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'selected',
        'set',
        '--appliance',
        'coffee-id',
        '--option',
        'ConsumerProducts.CoffeeMaker.Option.BeanAmount=',
      ]),
    ).resolves.toEqual([
      'ConsumerProducts.CoffeeMaker.Option.BeanAmount=ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Mild',
      'ConsumerProducts.CoffeeMaker.Option.BeanAmount=ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Normal',
    ]);
  });

  it('matches partial subcommands', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'hc-completion-subcommands-'));
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
        coffee: {
          appliance: {
            id: '013110393912004041',
            name: 'Dishy',
            connected: true,
          },
          settings: [],
          availablePrograms: [],
          programDetails: {},
        },
        oven: {
          appliance: {
            id: '715040390473004102',
            name: 'Kaffeevollautomat',
            connected: true,
          },
          settings: [],
          availablePrograms: [],
          programDetails: {},
        },
      };
    });

    const service = new HomeConnectService({
      store,
      profileName: 'production',
      environment: 'production',
    });

    await expect(
      service.completionSuggestions(['hc', 'program', 'sel']),
    ).resolves.toEqual(['selected']);

    await expect(
      service.completionSuggestions(['hc', 'program', 'selected', 'se']),
    ).resolves.toEqual(['set']);

    await expect(
      service.completionSuggestions(['hc', 'auth', 'dev']),
    ).resolves.toEqual(['device-login']);

    await expect(
      service.completionSuggestions(['hc', 'appliance', 'get']),
    ).resolves.toEqual(['--appliance']);

    await expect(service.completionSuggestions(['hc'])).resolves.toContain(
      '--appliance',
    );

    await expect(
      service.completionSuggestions(['hc', '--appl']),
    ).resolves.toEqual(['--appliance']);

    await expect(
      service.completionSuggestions(['hc', '--appliance', 'Dishy']),
    ).resolves.not.toContain('Dishy');

    await expect(
      service.completionSuggestions(['hc', '--appliance', 'Dishy', 'prog']),
    ).resolves.toEqual(['program']);

    await expect(
      service.completionSuggestions(['hc', 'program', 'selected', 'get']),
    ).resolves.toEqual(['--appliance']);

    await expect(
      service.completionSuggestions(['hc', 'program', 'active', 'get']),
    ).resolves.toEqual(['--appliance']);

    await expect(
      service.completionSuggestions([
        'hc',
        'program',
        'get',
        '--appliance',
        'Dishy',
        '--progr',
      ]),
    ).resolves.toEqual(['--program']);

    await expect(
      service.completionSuggestions(['hc', '--appliance', '']),
    ).resolves.toEqual([
      '013110393912004041',
      'Dishy',
      '715040390473004102',
      'Kaffeevollautomat',
    ]);

    await expect(
      service.completionSuggestions([
        'hc',
        '--appliance',
        '013110393912004041',
        '--output',
      ]),
    ).resolves.toEqual(['human', 'json', 'jsonl']);

    await expect(
      service.completionSuggestions([
        'hc',
        '--appliance',
        '013110393912004041',
        '--output',
        'json',
      ]),
    ).resolves.not.toContain('--output');

    await expect(
      service.completionSuggestions([
        'hc',
        '--appliance',
        '013110393912004041',
        '--i',
      ]),
    ).resolves.toEqual(['--interactive']);

    await expect(
      service.completionSuggestions(['hc', '--env', 'p']),
    ).resolves.toEqual(['production']);
  });

  it('loads settings lazily for setting completion when the cache is empty', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'hc-completion-settings-'));
    cleanup.push(baseDir);

    const store = new StateStore(baseDir);
    await store.updateProfileConfig('simulator', 'simulator', {
      clientId: 'client-id',
    });
    await store.mutateProfile('simulator', 'simulator', (profile) => {
      profile.session = {
        accessToken: 'token',
        tokenType: 'Bearer',
      };
      profile.appliances = {
        'coffee-id': {
          appliance: {
            id: 'coffee-id',
            name: 'CoffeeMaker Simulator',
            connected: true,
          },
          settings: [],
          settingDetails: {},
          availablePrograms: [],
          programDetails: {},
        },
      };
    });

    const service = new HomeConnectService({
      store,
      profileName: 'simulator',
      environment: 'simulator',
      clientFactory: () =>
        ({
          listAppliances: async () => [
            {
              id: 'coffee-id',
              name: 'CoffeeMaker Simulator',
              connected: true,
            },
          ],
          listSettings: async () => [
            {
              key: 'BSH.Common.Setting.PowerState',
              name: 'Power state',
            },
          ],
        }) as never,
    });

    await expect(
      service.completionSuggestions([
        'hc',
        '--profile',
        'simulator',
        'setting',
        'set',
        '--appliance',
        'CoffeeMaker Simulator',
        '--setting',
      ]),
    ).resolves.toEqual(['BSH.Common.Setting.PowerState']);
  });
});
