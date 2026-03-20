import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

async function createConfigDir() {
  const baseDir = await mkdtemp(join(tmpdir(), 'hc-cli-'));
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
                      {
                        key: 'Dishcare.Dishwasher.Option.SilenceOnDemand',
                        name: 'Silence on Demand',
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
                    {
                      key: 'Dishcare.Dishwasher.Option.SilenceOnDemand',
                      name: 'Silence on Demand',
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
                      key: 'Dishcare.Dishwasher.Option.ExtraDry',
                      name: 'Extra Dry',
                      constraints: {
                        allowedvalues: [true, false],
                      },
                    },
                    {
                      key: 'Dishcare.Dishwasher.Option.SilenceOnDemand',
                      name: 'Silence on Demand',
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

async function createMultiProfileConfigDir() {
  const baseDir = await mkdtemp(join(tmpdir(), 'hc-cli-multi-'));
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
                availablePrograms: [],
                programDetails: {},
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
              'sim-dishwasher-id': {
                appliance: {
                  id: 'sim-dishwasher-id',
                  name: 'CoffeeMaker Simulator',
                  connected: true,
                },
                settings: [],
                settingDetails: {},
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
                    options: [],
                  },
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

async function runCli(args: string[], homeDir: string) {
  return execFileAsync(
    process.execPath,
    ['--import', 'tsx', 'src/index.ts', ...args],
    {
      cwd: '/Users/matthias/Projects/clis/homeconnect-api-cli',
      env: {
        ...process.env,
        HOME: homeDir,
        XDG_CONFIG_HOME: join(homeDir, '.config'),
      },
    },
  );
}

async function runCliWithMockFetch(args: string[], homeDir: string) {
  return execFileAsync(
    process.execPath,
    [
      '--import',
      'tsx',
      '--import',
      './test/helpers/mock-fetch.ts',
      'src/index.ts',
      ...args,
    ],
    {
      cwd: '/Users/matthias/Projects/clis/homeconnect-api-cli',
      env: {
        ...process.env,
        HOME: homeDir,
        XDG_CONFIG_HOME: join(homeDir, '.config'),
      },
    },
  );
}

afterEach(async () => {
  await Promise.all(
    cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe('CLI black-box', () => {
  it('renders profile get in human mode', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(['profile', 'get'], homeDir);

    expect(stdout).toContain('PROFILE');
    expect(stdout).toContain('production');
  });

  it('renders auth status from local profile state', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(['auth', 'status'], homeDir);

    expect(stdout).toContain('AUTHENTICATED');
    expect(stdout).toContain('true');
  });

  it('groups top-level help into admin and Home Connect commands and hides completion', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(['--help'], homeDir);

    expect(stdout).toContain('Admin commands:');
    expect(stdout).toContain('Home Connect commands:');
    expect(stdout).toContain('auth');
    expect(stdout).toContain('profile');
    expect(stdout).toContain('appliance');
    expect(stdout).toContain('status');
    expect(stdout).toContain('setting');
    expect(stdout).toContain('program');
    expect(stdout).toContain('event');
    expect(stdout).not.toContain('completion');
  });

  it('accepts root-level appliance selectors for nested commands', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      ['--appliance', 'Dishy', 'appliance', 'get'],
      homeDir,
    );

    expect(stdout).toContain('NAME       Dishy');
    expect(stdout).toContain('CONNECTED  true');
  });

  it('infers the environment from the selected profile for normal commands when --env is omitted', async () => {
    const homeDir = await createMultiProfileConfigDir();
    const { stdout } = await runCli(
      [
        '--profile',
        'simulator',
        '--appliance',
        'CoffeeMaker Simulator',
        'appliance',
        'get',
      ],
      homeDir,
    );

    expect(stdout).toContain('NAME       CoffeeMaker Simulator');
  });

  it('renders a single appliance as json from local state', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      ['--output', 'json', '--appliance', 'Dishy', 'appliance', 'get'],
      homeDir,
    );

    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      data: {
        id: 'dishwasher-id',
        name: 'Dishy',
        connected: true,
      },
    });
  });

  it('returns completion suggestions for partial top-level and nested commands', async () => {
    const homeDir = await createConfigDir();
    const { stdout: topLevel } = await runCli(
      ['__complete', 'hc', '--appliance', 'Dishy', 'prog'],
      homeDir,
    );
    const { stdout: nestedFlag } = await runCli(
      ['__complete', 'hc', 'program', 'get', '--appliance', 'Dishy', '--progr'],
      homeDir,
    );

    expect(topLevel.trim().split('\n')).toContain('program');
    expect(nestedFlag.trim().split('\n')).toEqual(['--program']);
  });

  it('uses the requested profile and environment for completion data', async () => {
    const homeDir = await createMultiProfileConfigDir();
    const { stdout } = await runCli(
      [
        '__complete',
        'hc',
        '--profile',
        'simulator',
        '--env',
        'simulator',
        'setting',
        'set',
        '--appliance',
        '',
      ],
      homeDir,
    );

    expect(stdout.trim().split('\n')).toEqual([
      'sim-dishwasher-id',
      'CoffeeMaker Simulator',
    ]);
  });

  it('infers the environment from the selected profile for completion when --env is omitted', async () => {
    const homeDir = await createMultiProfileConfigDir();
    const { stdout } = await runCli(
      [
        '__complete',
        'hc',
        '--profile',
        'simulator',
        'setting',
        'set',
        '--appliance',
        '',
      ],
      homeDir,
    );

    expect(stdout.trim().split('\n')).toEqual([
      'sim-dishwasher-id',
      'CoffeeMaker Simulator',
    ]);
  });

  it('does not create a missing profile during completion', async () => {
    const homeDir = await createConfigDir();
    const stateFile = join(
      homeDir,
      '.config',
      'homeconnect-api-cli',
      'state.json',
    );
    const before = await readFile(stateFile, 'utf8');

    await runCli(['__complete', 'hc', '--profile', 'simulator'], homeDir);

    const after = await readFile(stateFile, 'utf8');
    expect(after).toBe(before);
    expect(after).not.toContain('"simulator"');
  });

  it('advances to the next flag after an exact appliance name containing spaces', async () => {
    const homeDir = await createMultiProfileConfigDir();
    const { stdout } = await runCli(
      [
        '__complete',
        'hc',
        '--profile',
        'simulator',
        'setting',
        'set',
        '--appliance',
        'CoffeeMaker Simulator',
      ],
      homeDir,
    );

    expect(stdout.trim().split('\n')).toEqual(['--setting']);
  });

  it('completes available programs for a selector with spaces', async () => {
    const homeDir = await createMultiProfileConfigDir();
    const { stdout } = await runCli(
      [
        '__complete',
        'hc',
        '--profile',
        'simulator',
        '--env',
        'simulator',
        'program',
        'selected',
        'set',
        '--appliance',
        'CoffeeMaker Simulator',
        '--program',
        '',
      ],
      homeDir,
    );

    expect(stdout.trim().split('\n')).toEqual([
      'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
    ]);
  });

  it('does not fall back to subcommand suggestions after an exact appliance value', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      ['__complete', 'hc', 'appliance', 'get', '--appliance', 'Dishy'],
      homeDir,
    );

    expect(stdout.trim()).toBe('');
  });

  it('does not suggest --appliance again after it is already present', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      ['__complete', 'hc', '--appliance', 'Dishy', '--'],
      homeDir,
    );

    expect(stdout.trim().split('\n')).not.toContain('--appliance');
  });

  it('completes other root flags after an appliance selector is already set', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      ['__complete', 'hc', '--appliance', 'Dishy', '--i'],
      homeDir,
    );

    expect(stdout.trim().split('\n')).toContain('--interactive');
    expect(stdout.trim().split('\n')).not.toContain('--appliance');
  });

  it('completes root flag values for output after an appliance selector is already set', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      ['__complete', 'hc', '--appliance', 'Dishy', '--output'],
      homeDir,
    );

    expect(stdout.trim().split('\n')).toEqual(['human', 'json', 'jsonl']);
  });

  it('advances past an exact root output value instead of repeating the flag', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      ['__complete', 'hc', '--appliance', 'Dishy', '--output', 'json'],
      homeDir,
    );

    expect(stdout.trim().split('\n')).not.toContain('--output');
  });

  it('does not suggest --appliance again for exact nested command paths', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      ['__complete', 'hc', '--appliance', 'Dishy', 'program', 'active', 'get'],
      homeDir,
    );

    expect(stdout.trim().split('\n')).not.toContain('--appliance');
  });

  it('returns nested flags after an exact selected set command path', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      [
        '__complete',
        'hc',
        '--appliance',
        'Dishy',
        'program',
        'selected',
        'set',
        '--',
      ],
      homeDir,
    );

    expect(stdout.trim().split('\n')).toEqual(['--program', '--option']);
  });

  it('returns nested flags after an exact active set command path', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      [
        '__complete',
        'hc',
        '--appliance',
        'Dishy',
        'program',
        'active',
        'set',
        '--',
      ],
      homeDir,
    );

    expect(stdout.trim().split('\n')).toEqual(['--program', '--option']);
  });

  it('prints per-option selected-program curl commands in debug mode', async () => {
    const homeDir = await createConfigDir();
    const { stderr } = await runCliWithMockFetch(
      [
        '--debug',
        '--appliance',
        'Dishy',
        'program',
        'selected',
        'set',
        '--option',
        'Dishcare.Dishwasher.Option.ExtraDry=true',
        '--option',
        'Dishcare.Dishwasher.Option.SilenceOnDemand=false',
      ],
      homeDir,
    );

    expect(stderr).toContain(
      "/programs/selected/options/Dishcare.Dishwasher.Option.ExtraDry'",
    );
    expect(stderr).toContain(
      "/programs/selected/options/Dishcare.Dishwasher.Option.SilenceOnDemand'",
    );
    const putLines = stderr
      .trim()
      .split('\n')
      .filter((line) => line.includes("-X 'PUT'"));
    expect(putLines).not.toContain(
      "curl -i -X 'PUT' -H 'accept: application/vnd.bsh.sdk.v1+json' -H 'authorization: Bearer <redacted>' -H 'content-type: application/vnd.bsh.sdk.v1+json' 'https://api.home-connect.com/api/homeappliances/dishwasher-id/programs/selected'",
    );
  });

  it('renders selected program set results as a program snapshot', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCliWithMockFetch(
      [
        '--appliance',
        'Dishy',
        'program',
        'selected',
        'set',
        '--option',
        'Dishcare.Dishwasher.Option.ExtraDry=true',
      ],
      homeDir,
    );

    expect(stdout).toContain('PROGRAM: Eco 50');
    expect(stdout).toContain('OPTION');
    expect(stdout).toContain('Extra Dry');
  });

  it('prints per-option active-program curl commands in debug mode', async () => {
    const homeDir = await createConfigDir();
    const { stderr } = await runCliWithMockFetch(
      [
        '--debug',
        '--appliance',
        'Dishy',
        'program',
        'active',
        'set',
        '--option',
        'Dishcare.Dishwasher.Option.ExtraDry=true',
        '--option',
        'Dishcare.Dishwasher.Option.SilenceOnDemand=false',
      ],
      homeDir,
    );

    expect(stderr).toContain(
      "/programs/active/options/Dishcare.Dishwasher.Option.ExtraDry'",
    );
    expect(stderr).toContain(
      "/programs/active/options/Dishcare.Dishwasher.Option.SilenceOnDemand'",
    );
    const putLines = stderr
      .trim()
      .split('\n')
      .filter((line) => line.includes("-X 'PUT'"));
    expect(putLines).not.toContain(
      "curl -i -X 'PUT' -H 'accept: application/vnd.bsh.sdk.v1+json' -H 'authorization: Bearer <redacted>' -H 'content-type: application/vnd.bsh.sdk.v1+json' 'https://api.home-connect.com/api/homeappliances/dishwasher-id/programs/active'",
    );
  });

  it('renders active program set results as a program snapshot', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCliWithMockFetch(
      [
        '--appliance',
        'Dishy',
        'program',
        'active',
        'set',
        '--option',
        'Dishcare.Dishwasher.Option.ExtraDry=true',
      ],
      homeDir,
    );

    expect(stdout).toContain('PROGRAM: Eco 50');
    expect(stdout).toContain('OPTION');
    expect(stdout).toContain('Extra Dry');
  });

  it('advances to option flags after an exact active set program value', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      [
        '__complete',
        'hc',
        '--appliance',
        'Dishy',
        'program',
        'active',
        'set',
        '--program',
        'Dishcare.Dishwasher.Program.Eco50',
      ],
      homeDir,
    );

    expect(stdout.trim().split('\n')).toEqual(['--option']);
  });

  it('does not suggest singular flags again once already present', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      [
        '__complete',
        'hc',
        '--profile',
        'simulator',
        '--env',
        'simulator',
        '--',
      ],
      homeDir,
    );

    expect(stdout.trim().split('\n')).not.toContain('--profile');
    expect(stdout.trim().split('\n')).not.toContain('--env');
  });

  it('returns completion suggestions for option values', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      [
        '__complete',
        'hc',
        'program',
        'selected',
        'set',
        '--appliance',
        'Dishy',
        '--option',
        'ExtraDry=t',
      ],
      homeDir,
    );

    expect(stdout.trim().split('\n')).toEqual([
      'Dishcare.Dishwasher.Option.ExtraDry=true',
    ]);
  });

  it('returns completion suggestions for setting values', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      [
        '__complete',
        'hc',
        '--appliance',
        'Dishy',
        'setting',
        'set',
        '--setting',
        'BSH.Common.Setting.PowerState=Of',
      ],
      homeDir,
    );

    expect(stdout.trim().split('\n')).toEqual([
      'BSH.Common.Setting.PowerState=BSH.Common.EnumType.PowerState.Off',
    ]);
  });

  it('advances an exact setting key into assignment candidates', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      [
        '__complete',
        'hc',
        '--appliance',
        'Dishy',
        'setting',
        'set',
        '--setting',
        'BSH.Common.Setting.PowerState',
      ],
      homeDir,
    );

    expect(stdout.trim().split('\n')).toEqual([
      'BSH.Common.Setting.PowerState=BSH.Common.EnumType.PowerState.On',
      'BSH.Common.Setting.PowerState=BSH.Common.EnumType.PowerState.Off',
    ]);
  });

  it('persists profile language changes through the CLI entrypoint', async () => {
    const homeDir = await createConfigDir();
    await runCli(['profile', 'set', '--language', 'de-DE'], homeDir);

    const state = JSON.parse(
      await readFile(
        join(homeDir, '.config', 'homeconnect-api-cli', 'state.json'),
        'utf8',
      ),
    ) as {
      profiles: {
        production: {
          profile: {
            language?: string;
          };
        };
      };
    };

    expect(state.profiles.production.profile.language).toBe('de-DE');
  });

  it('persists profile environment changes through the CLI entrypoint', async () => {
    const homeDir = await createConfigDir();
    await runCli(['profile', 'set', '--env', 'simulator'], homeDir);

    const state = JSON.parse(
      await readFile(
        join(homeDir, '.config', 'homeconnect-api-cli', 'state.json'),
        'utf8',
      ),
    ) as {
      profiles: {
        production: {
          profile: {
            environment: string;
          };
        };
      };
    };

    expect(state.profiles.production.profile.environment).toBe('simulator');
  });

  it('persists profile output format through the CLI entrypoint', async () => {
    const homeDir = await createConfigDir();
    await runCli(['profile', 'set', '--output', 'json'], homeDir);

    const state = JSON.parse(
      await readFile(
        join(homeDir, '.config', 'homeconnect-api-cli', 'state.json'),
        'utf8',
      ),
    ) as {
      profiles: {
        production: {
          profile: {
            output?: string;
          };
        };
      };
    };

    expect(state.profiles.production.profile.output).toBe('json');
  });

  it('uses the stored profile output format when --output is omitted', async () => {
    const homeDir = await createConfigDir();
    await runCli(['profile', 'set', '--output', 'json'], homeDir);

    const { stdout } = await runCli(
      ['--appliance', 'Dishy', 'appliance', 'get'],
      homeDir,
    );

    expect(JSON.parse(stdout)).toMatchObject({
      ok: true,
      data: {
        id: 'dishwasher-id',
        name: 'Dishy',
        connected: true,
      },
    });
  });

  it('persists explicit first-time language usage in the profile', async () => {
    const homeDir = await createConfigDir();
    await runCli(
      ['--language', 'de-DE', '--appliance', 'Dishy', 'appliance', 'get'],
      homeDir,
    );

    const state = JSON.parse(
      await readFile(
        join(homeDir, '.config', 'homeconnect-api-cli', 'state.json'),
        'utf8',
      ),
    ) as {
      profiles: {
        production: {
          profile: {
            language?: string;
          };
        };
      };
    };

    expect(state.profiles.production.profile.language).toBe('de-DE');
  });

  it('does not overwrite persisted language with later temporary overrides', async () => {
    const homeDir = await createConfigDir();
    await runCli(['profile', 'set', '--language', 'de-DE'], homeDir);
    await runCli(
      ['--language', 'en-US', '--appliance', 'Dishy', 'appliance', 'get'],
      homeDir,
    );

    const state = JSON.parse(
      await readFile(
        join(homeDir, '.config', 'homeconnect-api-cli', 'state.json'),
        'utf8',
      ),
    ) as {
      profiles: {
        production: {
          profile: {
            language?: string;
          };
        };
      };
    };

    expect(state.profiles.production.profile.language).toBe('de-DE');
  });

  it('persists explicit first-time output usage in the profile', async () => {
    const homeDir = await createConfigDir();
    await runCli(
      ['--output', 'json', '--appliance', 'Dishy', 'appliance', 'get'],
      homeDir,
    );

    const state = JSON.parse(
      await readFile(
        join(homeDir, '.config', 'homeconnect-api-cli', 'state.json'),
        'utf8',
      ),
    ) as {
      profiles: {
        production: {
          profile: {
            output?: string;
          };
        };
      };
    };

    expect(state.profiles.production.profile.output).toBe('json');
  });

  it('persists explicit first-time environment usage for a new profile', async () => {
    const homeDir = await createConfigDir();
    await runCli(
      ['--profile', 'simulator', '--env', 'simulator', 'profile', 'get'],
      homeDir,
    );

    const state = JSON.parse(
      await readFile(
        join(homeDir, '.config', 'homeconnect-api-cli', 'state.json'),
        'utf8',
      ),
    ) as {
      profiles: {
        simulator: {
          profile: {
            environment: string;
          };
        };
      };
    };

    expect(state.profiles.simulator.profile.environment).toBe('simulator');
  });

  it('does not overwrite persisted output with later temporary overrides', async () => {
    const homeDir = await createConfigDir();
    await runCli(['profile', 'set', '--output', 'json'], homeDir);
    await runCli(
      ['--output', 'human', '--appliance', 'Dishy', 'appliance', 'get'],
      homeDir,
    );

    const state = JSON.parse(
      await readFile(
        join(homeDir, '.config', 'homeconnect-api-cli', 'state.json'),
        'utf8',
      ),
    ) as {
      profiles: {
        production: {
          profile: {
            output?: string;
          };
        };
      };
    };

    expect(state.profiles.production.profile.output).toBe('json');
  });

  it('generates the expected zsh completion wrapper', async () => {
    const homeDir = await createConfigDir();
    const { stdout } = await runCli(
      ['completion', 'generate', '--shell', 'zsh'],
      homeDir,
    );

    expect(stdout).toContain('#compdef hc');
    expect(stdout).toContain(`args=("\${(@Q)words[@]}")`);
    expect(stdout).toContain('_describe "values" suggestions');
    expect(stdout).toContain(`hc __complete "\${args[@]}"`);
  });

  it('rejects duplicate appliance flags', async () => {
    const homeDir = await createConfigDir();

    await expect(
      runCli(
        [
          '--appliance',
          'Dishy',
          '--appliance',
          'dishwasher-id',
          'appliance',
          'get',
        ],
        homeDir,
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        'APPLIANCE_DUPLICATE: --appliance may only be provided once',
      ),
    });
  });
});
