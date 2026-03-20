import { afterEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../src/core/errors.js';
import { printResult } from '../src/core/output.js';

describe('human output', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders program details in a human-readable format', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: {
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
    });

    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('PROGRAM: Eco 50'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('Extra Dry'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('true, false'),
    );
  });

  it('renders program option ranges with unit and type', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: {
        key: 'Dishcare.Dishwasher.Program.Eco50',
        name: 'Eco 50',
        options: [
          {
            key: 'BSH.Common.Option.StartInRelative',
            name: 'Start time',
            type: 'Int',
            unit: 's',
            constraints: {
              min: 0,
              max: 86400,
            },
          },
        ],
      },
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('TYPE'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('Int'));
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('0-86400 seconds'),
    );
  });

  it('renders a single appliance in a human-readable format', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: {
        id: 'coffee-id',
        name: 'Kaffeevollautomat',
        type: 'CoffeeMaker',
        brand: 'Bosch',
        vib: 'HCS06COM1',
        connected: true,
      },
    });

    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('NAME       Kaffeevollautomat'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('CONNECTED  true'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('VIB        HCS06COM1'),
    );
  });

  it('does not print null error details', () => {
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    const error = new CliError('API_ERROR', 'Request failed', {
      retryAfter: null,
    });

    printResult('human', {
      ok: false,
      code: error.code,
      message: error.message,
      details: error.details,
    });

    expect(stderrSpy).toHaveBeenCalledWith('API_ERROR: Request failed\n');
    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it('renders auth status in a human-readable format', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: {
        profile: 'production',
        environment: 'production',
        authenticated: true,
        configuredScope: 'IdentifyAppliance Monitor Control Settings',
      },
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('PROFILE'));
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('AUTHENTICATED     true'),
    );
  });

  it('renders profile config in a human-readable format', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: {
        name: 'production',
        environment: 'production',
        language: 'de-DE',
        output: 'json',
        clientId: 'client-id',
      },
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('LANGUAGE'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('de-DE'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('OUTPUT'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('json'));
  });

  it('renders action results in a human-readable format', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: {
        appliance: 'Dishy',
        program: 'Dishcare.Dishwasher.Program.Eco50',
        options: ['Dishcare.Dishwasher.Option.ExtraDry=true'],
        command:
          'hc program selected set --appliance Dishy --option Dishcare.Dishwasher.Option.ExtraDry=true',
      },
    });

    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('APPLIANCE  Dishy'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('OPTIONS'));
  });

  it('renders event envelopes in a human-readable format', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: {
        appliance: 'Dishy',
        event: {
          items: [
            {
              key: 'BSH.Common.Event.ProgramFinished',
              name: 'Program finished',
              displayvalue: 'Confirmed',
            },
          ],
        },
      },
    });

    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringMatching(/----- .* -----/),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('APPLIANCE  Dishy'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('EVENT      BSH.Common.Event.ProgramFinished'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('ITEM       Program finished'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('VALUE      Confirmed'),
    );
  });

  it('appends units when rendering raw values', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: [
        {
          key: 'Cooking.Oven.Option.SetpointTemperature',
          name: 'Setpoint temperature',
          value: 180,
          unit: '°C',
        },
      ],
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('180 °C'));
  });

  it('prefers displayvalue over raw value plus unit', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: [
        {
          key: 'Cooking.Oven.Option.SetpointTemperature',
          name: 'Setpoint temperature',
          value: 180,
          unit: '°C',
          displayvalue: '180 °C',
        },
      ],
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('180 °C'));
    expect(stdoutSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('180 °C °C'),
    );
  });

  it('humanizes enum allowed values in program option output', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: {
        key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.CaffeGrande',
        name: 'Caffe Grande',
        options: [
          {
            key: 'ConsumerProducts.CoffeeMaker.Option.BeanAmount',
            name: 'Bean amount',
            type: 'String',
            constraints: {
              allowedvalues: [
                'ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Mild',
                'ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Normal',
              ],
            },
          },
        ],
      },
    });

    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('Mild, Normal'),
    );
    expect(stdoutSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(
        'ConsumerProducts.CoffeeMaker.EnumType.BeanAmount.Mild',
      ),
    );
  });

  it('shows allowed values for settings in human output', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: [
        {
          key: 'BSH.Common.Setting.PowerState',
          name: 'Power state',
          type: 'String',
          constraints: {
            allowedvalues: [
              'BSH.Common.EnumType.PowerState.On',
              'BSH.Common.EnumType.PowerState.Off',
            ],
          },
        },
      ],
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('SETTING'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('TYPE'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('On, Off'));
  });

  it('renders a single setting detail in human output', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: {
        key: 'BSH.Common.Setting.PowerState',
        name: 'Power state',
        type: 'String',
        constraints: {
          allowedvalues: [
            'BSH.Common.EnumType.PowerState.On',
            'BSH.Common.EnumType.PowerState.Off',
          ],
        },
      },
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('SETTING'));
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('Power state'),
    );
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('On, Off'));
  });
});

describe('aggregated human output', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders aggregated setting snapshots with setting-specific columns', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: [
        {
          applianceId: 'dishy-id',
          applianceName: 'Dishy',
          items: [
            {
              key: 'BSH.Common.Setting.PowerState',
              name: 'Power state',
              type: 'String',
              constraints: {
                allowedvalues: [
                  'BSH.Common.EnumType.PowerState.On',
                  'BSH.Common.EnumType.PowerState.Off',
                ],
              },
            },
          ],
        },
      ],
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('SETTING'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('TYPE'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('On, Off'));
    expect(stdoutSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('STATUS'),
    );
  });

  it('renders aggregated program snapshots with program-specific columns', () => {
    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    printResult('human', {
      ok: true,
      data: [
        {
          applianceId: 'coffee-id',
          applianceName: 'Kaffeevollautomat',
          items: [
            {
              key: 'ConsumerProducts.CoffeeMaker.Program.Beverage.Espresso',
              name: 'Espresso',
            },
          ],
        },
      ],
    });

    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('PROGRAM'));
    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining('Kaffeevollautomat'),
    );
    expect(stdoutSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('VALUE'),
    );
    expect(stdoutSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('STATUS'),
    );
  });
});
