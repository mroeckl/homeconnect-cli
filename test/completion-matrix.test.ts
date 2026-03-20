import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

async function createConfigDir() {
  const baseDir = await mkdtemp(join(tmpdir(), 'hc-cli-matrix-'));
  cleanup.push(baseDir);
  const configDir = join(baseDir, '.config', 'homeconnect-api-cli');
  await mkdir(configDir, { recursive: true });
  await writeFile(
    join(configDir, 'state.json'),
    JSON.stringify(
      {
        profiles: {
          production: {
            profile: {
              name: 'production',
              environment: 'production',
              clientId: 'client-id',
            },
            session: {
              accessToken: 'token',
              tokenType: 'Bearer',
            },
            appliances: {
              'dishwasher-id': {
                appliance: {
                  id: 'dishwasher-id',
                  name: 'Dishy',
                  connected: true,
                },
                settings: [
                  {
                    key: 'BSH.Common.Setting.PowerState',
                    name: 'Power state',
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
                    key: 'Dishcare.Dishwasher.Program.Eco50',
                    name: 'Eco 50',
                  },
                ],
                programDetails: {
                  'Dishcare.Dishwasher.Program.Eco50': {
                    key: 'Dishcare.Dishwasher.Program.Eco50',
                    name: 'Eco 50',
                    options: [
                      {
                        key: 'Dishcare.Dishwasher.Option.ExtraDry',
                        name: 'Extra Dry',
                        constraints: {
                          allowedvalues: [true, false],
                        },
                      },
                    ],
                  },
                },
                selectedProgram: {
                  key: 'Dishcare.Dishwasher.Program.Eco50',
                  name: 'Eco 50',
                  options: [
                    {
                      key: 'Dishcare.Dishwasher.Option.ExtraDry',
                      name: 'Extra Dry',
                      constraints: {
                        allowedvalues: [true, false],
                      },
                    },
                  ],
                },
              },
            },
            rateLimit: {
              avoidableFailures: 0,
            },
          },
          simulator: {
            profile: {
              name: 'simulator',
              environment: 'simulator',
              clientId: 'sim-client-id',
            },
            session: {
              accessToken: 'token',
              tokenType: 'Bearer',
            },
            appliances: {
              'sim-coffee-id': {
                appliance: {
                  id: 'sim-coffee-id',
                  name: 'CoffeeMaker Simulator',
                  connected: true,
                },
                settings: [
                  {
                    key: 'BSH.Common.Setting.PowerState',
                    name: 'Power state',
                  },
                ],
                settingDetails: {
                  'BSH.Common.Setting.PowerState': {
                    key: 'BSH.Common.Setting.PowerState',
                    name: 'Power state',
                    constraints: {
                      allowedvalues: [
                        'BSH.Common.EnumType.PowerState.On',
                        'BSH.Common.EnumType.PowerState.Standby',
                      ],
                    },
                  },
                },
                availablePrograms: [],
                programDetails: {},
              },
            },
            rateLimit: {
              avoidableFailures: 0,
            },
          },
        },
      },
      null,
      2,
    ),
  );
  return baseDir;
}

async function runComplete(argv: string[], homeDir: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    process.execPath,
    ['--import', 'tsx', 'src/index.ts', '__complete', ...argv],
    {
      cwd: '/Users/matthias/Projects/clis/homeconnect-api-cli',
      env: {
        ...process.env,
        HOME: homeDir,
        XDG_CONFIG_HOME: join(homeDir, '.config'),
      },
    },
  );

  return stdout.trim() === '' ? [] : stdout.trim().split('\n');
}

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

interface MatrixCase {
  name: string;
  argv: string[];
  includes?: string[];
  equals?: string[];
  excludes?: string[];
}

describe('completion matrix', () => {
  const cases: MatrixCase[] = [
    {
      name: 'partial top-level command after root selector',
      argv: ['hc', '--appliance', 'Dishy', 'prog'],
      includes: ['program'],
    },
    {
      name: 'partial nested flag',
      argv: ['hc', 'program', 'get', '--appliance', 'Dishy', '--progr'],
      equals: ['--program'],
    },
    {
      name: 'exact appliance value transitions to no further suggestions',
      argv: ['hc', 'appliance', 'get', '--appliance', 'Dishy'],
      equals: [],
    },
    {
      name: 'partial root flag after selector',
      argv: ['hc', '--appliance', 'Dishy', '--i'],
      includes: ['--interactive'],
      excludes: ['--appliance'],
    },
    {
      name: 'root flag values',
      argv: ['hc', '--appliance', 'Dishy', '--output'],
      equals: ['human', 'json', 'jsonl'],
    },
    {
      name: 'exact root flag value transition',
      argv: ['hc', '--appliance', 'Dishy', '--output', 'json'],
      excludes: ['--output'],
    },
    {
      name: 'exact nested command path transition',
      argv: ['hc', '--appliance', 'Dishy', 'program', 'active', 'get'],
      excludes: ['--appliance'],
    },
    {
      name: 'used root singular flags are not suggested again',
      argv: ['hc', '--profile', 'simulator', '--env', 'simulator', '--'],
      excludes: ['--profile', '--env'],
    },
    {
      name: 'selected set nested flags',
      argv: ['hc', '--appliance', 'Dishy', 'program', 'selected', 'set', '--'],
      equals: ['--program', '--option'],
    },
    {
      name: 'active set nested flags',
      argv: ['hc', '--appliance', 'Dishy', 'program', 'active', 'set', '--'],
      equals: ['--program', '--option'],
    },
    {
      name: 'exact active program value transitions to option flags',
      argv: [
        'hc',
        '--appliance',
        'Dishy',
        'program',
        'active',
        'set',
        '--program',
        'Dishcare.Dishwasher.Program.Eco50',
      ],
      equals: ['--option'],
    },
    {
      name: 'setting completion for selector with spaces advances into assignments',
      argv: [
        'hc',
        '--profile',
        'simulator',
        '--env',
        'simulator',
        'setting',
        'set',
        '--appliance',
        'CoffeeMaker Simulator',
        '--setting',
        '',
      ],
      equals: [
        'BSH.Common.Setting.PowerState=BSH.Common.EnumType.PowerState.On',
        'BSH.Common.Setting.PowerState=BSH.Common.EnumType.PowerState.Standby',
      ],
    },
    {
      name: 'exact setting key transitions into assignment candidates',
      argv: [
        'hc',
        '--profile',
        'simulator',
        '--env',
        'simulator',
        'setting',
        'set',
        '--appliance',
        'CoffeeMaker Simulator',
        '--setting',
        'BSH.Common.Setting.PowerState',
      ],
      equals: [
        'BSH.Common.Setting.PowerState=BSH.Common.EnumType.PowerState.On',
        'BSH.Common.Setting.PowerState=BSH.Common.EnumType.PowerState.Standby',
      ],
    },
    {
      name: 'setting value prefix completion',
      argv: [
        'hc',
        '--appliance',
        'Dishy',
        'setting',
        'set',
        '--setting',
        'BSH.Common.Setting.PowerState=Of',
      ],
      equals: [
        'BSH.Common.Setting.PowerState=BSH.Common.EnumType.PowerState.Off',
      ],
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      const homeDir = await createConfigDir();
      const suggestions = await runComplete(testCase.argv, homeDir);

      if (testCase.equals) {
        expect(suggestions).toEqual(testCase.equals);
      }

      for (const candidate of testCase.includes ?? []) {
        expect(suggestions).toContain(candidate);
      }

      for (const candidate of testCase.excludes ?? []) {
        expect(suggestions).not.toContain(candidate);
      }
    });
  }
});
