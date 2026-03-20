import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

async function createConfigDir() {
  const baseDir = await mkdtemp(join(tmpdir(), 'hc-cli-program-matrix-'));
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
                settings: [],
                settingDetails: {},
                availablePrograms: [
                  {
                    key: 'Dishcare.Dishwasher.Program.Eco50',
                    name: 'Eco 50',
                  },
                  {
                    key: 'Dishcare.Dishwasher.Program.Auto2',
                    name: 'Auto 2',
                  },
                  {
                    key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.CaffeLatte',
                    name: 'Caffe Latte',
                  },
                ],
                programDetails: {
                  'Dishcare.Dishwasher.Program.Eco50': {
                    key: 'Dishcare.Dishwasher.Program.Eco50',
                    name: 'Eco 50',
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
                        key: 'Dishcare.Dishwasher.Option.ExtraDry',
                        name: 'Extra Dry',
                        constraints: {
                          allowedvalues: [true, false],
                        },
                      },
                    ],
                  },
                  'Dishcare.Dishwasher.Program.Auto2': {
                    key: 'Dishcare.Dishwasher.Program.Auto2',
                    name: 'Auto 2',
                    options: [
                      {
                        key: 'BSH.Common.Option.StartInRelative',
                        name: 'Start in relative',
                        constraints: {
                          allowedvalues: [0, 3600],
                        },
                      },
                      {
                        key: 'Dishcare.Dishwasher.Option.ExtraDry',
                        name: 'Extra Dry',
                        constraints: {
                          allowedvalues: [true, false],
                        },
                      },
                    ],
                  },
                  'ConsumerProducts.CoffeeMaker.Program.Beverage.CaffeLatte': {
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
                            'ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Strong',
                          ],
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
                activeProgram: {
                  key: 'Dishcare.Dishwasher.Program.Eco50',
                  name: 'Eco 50',
                  options: [
                    {
                      key: 'BSH.Common.Option.StartInRelative',
                      name: 'Start in relative',
                      constraints: {
                        allowedvalues: [0, 3600],
                      },
                    },
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

describe('completion program matrix', () => {
  const cases: MatrixCase[] = [
    {
      name: 'program key completion by suffix fragment',
      argv: [
        'hc',
        'program',
        'get',
        '--appliance',
        'Dishy',
        '--program',
        'Eco',
      ],
      equals: ['Dishcare.Dishwasher.Program.Eco50'],
    },
    {
      name: 'program key completion by key fragment',
      argv: [
        'hc',
        'program',
        'get',
        '--appliance',
        'Dishy',
        '--program',
        'Dishcare.Dishwasher.Program.Au',
      ],
      equals: ['Dishcare.Dishwasher.Program.Auto2'],
    },
    {
      name: 'selected set excludes StartInRelative from option completion',
      argv: [
        'hc',
        'program',
        'selected',
        'set',
        '--appliance',
        'Dishy',
        '--program',
        'Dishcare.Dishwasher.Program.Eco50',
        '--option',
        'StartInRelative',
      ],
      equals: [],
    },
    {
      name: 'selected set still completes writable option names',
      argv: [
        'hc',
        'program',
        'selected',
        'set',
        '--appliance',
        'Dishy',
        '--program',
        'Dishcare.Dishwasher.Program.Eco50',
        '--option',
        'ExtraDry',
      ],
      equals: [
        'Dishcare.Dishwasher.Option.ExtraDry=true',
        'Dishcare.Dishwasher.Option.ExtraDry=false',
      ],
    },
    {
      name: 'active set includes StartInRelative option',
      argv: [
        'hc',
        'program',
        'active',
        'set',
        '--appliance',
        'Dishy',
        '--program',
        'Dishcare.Dishwasher.Program.Eco50',
        '--option',
        'StartInRelative',
      ],
      equals: [
        'BSH.Common.Option.StartInRelative=0',
        'BSH.Common.Option.StartInRelative=3600',
      ],
    },
    {
      name: 'selected option value completion',
      argv: [
        'hc',
        'program',
        'selected',
        'set',
        '--appliance',
        'Dishy',
        '--program',
        'Dishcare.Dishwasher.Program.Eco50',
        '--option',
        'ExtraDry=t',
      ],
      equals: ['Dishcare.Dishwasher.Option.ExtraDry=true'],
    },
    {
      name: 'selected exact option key transitions into assignment candidates',
      argv: [
        'hc',
        '--appliance',
        'Dishy',
        'program',
        'selected',
        'set',
        '--program',
        'ConsumerProducts.CoffeeMaker.Program.Beverage.CaffeLatte',
        '--option',
        'ConsumerProducts.CoffeeMaker.Option.BeanAmount',
      ],
      equals: [
        'ConsumerProducts.CoffeeMaker.Option.BeanAmount=ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Mild',
        'ConsumerProducts.CoffeeMaker.Option.BeanAmount=ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Normal',
        'ConsumerProducts.CoffeeMaker.Option.BeanAmount=ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Strong',
      ],
    },
    {
      name: 'active option value completion',
      argv: [
        'hc',
        'program',
        'active',
        'set',
        '--appliance',
        'Dishy',
        '--program',
        'Dishcare.Dishwasher.Program.Eco50',
        '--option',
        'ExtraDry=f',
      ],
      equals: ['Dishcare.Dishwasher.Option.ExtraDry=false'],
    },
    {
      name: 'active exact program value transitions to flags',
      argv: [
        'hc',
        '--appliance',
        'Dishy',
        'program',
        'active',
        'set',
        '--program',
        'Dishcare.Dishwasher.Program.Auto2',
      ],
      equals: ['--option'],
    },
    {
      name: 'selected exact program value transitions to flags',
      argv: [
        'hc',
        '--appliance',
        'Dishy',
        'program',
        'selected',
        'set',
        '--program',
        'Dishcare.Dishwasher.Program.Eco50',
      ],
      equals: ['--option'],
    },
    {
      name: 'exact selected set path does not repeat singular flags already used',
      argv: [
        'hc',
        '--appliance',
        'Dishy',
        'program',
        'selected',
        'set',
        '--program',
        'Dishcare.Dishwasher.Program.Eco50',
        '--',
      ],
      equals: ['--option'],
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
