import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import { GuardEngine } from '../src/services/guard-engine.js';
import type { ProfileState } from '../src/types.js';

function createProfile(): ProfileState {
  return {
    profile: {
      name: 'production',
      environment: 'production',
    },
    session: {
      accessToken: 'token',
      tokenType: 'Bearer',
    },
    appliances: {
      oven: {
        appliance: {
          id: 'oven',
          connected: true,
          name: 'Oven',
        },
        availablePrograms: [
          {
            key: 'Dishcare.Program.Eco',
            options: [
              {
                key: 'Dishcare.Option.ExtraDry',
                constraints: {
                  allowedvalues: [true, false],
                },
              },
              {
                key: 'Dishcare.Option.Temp',
                constraints: {
                  min: 40,
                  max: 70,
                },
              },
            ],
          },
        ],
      },
      offline: {
        appliance: {
          id: 'offline',
          connected: false,
        },
      },
    },
    rateLimit: {
      avoidableFailures: 0,
    },
  };
}

describe('GuardEngine', () => {
  const guard = new GuardEngine();

  it('rejects disconnected appliances', () => {
    expect(() =>
      guard.requireConnected(createProfile(), 'offline'),
    ).toThrowError(CliError);
  });

  it('rejects unavailable programs', () => {
    expect(() =>
      guard.requireAvailableProgram(createProfile(), 'oven', 'Unknown.Program'),
    ).toThrowError(CliError);
  });

  it('rejects invalid option values', () => {
    const profile = createProfile();
    const program = guard.requireAvailableProgram(
      profile,
      'oven',
      'Dishcare.Program.Eco',
    );
    expect(() =>
      guard.validateOptions(program, [
        { key: 'Dishcare.Option.ExtraDry', value: 'invalid' },
      ]),
    ).toThrowError(CliError);
  });

  it('accepts valid numeric option ranges', () => {
    const profile = createProfile();
    const program = guard.requireAvailableProgram(
      profile,
      'oven',
      'Dishcare.Program.Eco',
    );
    expect(() =>
      guard.validateOptions(program, [
        { key: 'Dishcare.Option.Temp', value: '50' },
      ]),
    ).not.toThrow();
  });
});
