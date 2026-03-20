import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CliError } from '../src/core/errors.js';
import {
  DEFAULT_HOME_CONNECT_SCOPE,
  HOME_CONNECT_JSON_MEDIA_TYPE,
} from '../src/core/home-connect-defaults.js';
import { HomeConnectClient } from '../src/services/home-connect-client.js';

describe('HomeConnectClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the default scope in the authorization URL', () => {
    const client = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
        clientId: 'client-id',
      },
    });

    const url = new URL(client.getAuthorizationUrl());
    expect(url.searchParams.get('scope')).toBe(DEFAULT_HOME_CONNECT_SCOPE);
  });

  it('uses the simulator OAuth authorize URL for simulator profiles', () => {
    const client = new HomeConnectClient({
      profile: {
        name: 'simulator',
        environment: 'simulator',
        clientId: 'client-id',
      },
    });

    expect(client.getAuthorizationUrl()).toContain(
      'https://simulator.home-connect.com/security/oauth/authorize',
    );
  });

  it('uses the simulator OAuth token URL for simulator profiles', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'token',
          token_type: 'Bearer',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );

    const client = new HomeConnectClient({
      profile: {
        name: 'simulator',
        environment: 'simulator',
        clientId: 'client-id',
      },
    });

    await client.exchangeAuthorizationCode('code');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://simulator.home-connect.com/security/oauth/token',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('uses vendor media types and unwraps named collections', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            homeappliances: [
              {
                haId: 'dishy-id',
                name: 'Dishy',
                connected: true,
              },
            ],
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': HOME_CONNECT_JSON_MEDIA_TYPE,
          },
        },
      ),
    );

    const client = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
      },
      accessToken: 'token',
    });

    await expect(client.listAppliances()).resolves.toEqual([
      {
        id: 'dishy-id',
        name: 'Dishy',
        connected: true,
        type: undefined,
        brand: undefined,
        vib: undefined,
      },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.home-connect.com/api/homeappliances',
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );

    const headers = fetchMock.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('accept')).toBe(HOME_CONNECT_JSON_MEDIA_TYPE);
    expect(headers.get('authorization')).toBe('Bearer token');
  });

  it('uses Accept-Language from override or profile', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              homeappliances: [],
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': HOME_CONNECT_JSON_MEDIA_TYPE,
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              homeappliances: [],
            },
          }),
          {
            status: 200,
            headers: {
              'content-type': HOME_CONNECT_JSON_MEDIA_TYPE,
            },
          },
        ),
      );

    const profileClient = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
        language: 'de-DE',
      },
      accessToken: 'token',
    });
    await profileClient.listAppliances();
    expect(
      (fetchMock.mock.calls[0][1]?.headers as Headers).get('accept-language'),
    ).toBe('de-DE');

    const overrideClient = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
        language: 'de-DE',
      },
      accessToken: 'token',
      language: 'en-US',
    });
    await overrideClient.listAppliances();
    expect(
      (fetchMock.mock.calls[1][1]?.headers as Headers).get('accept-language'),
    ).toBe('en-US');
  });

  it('maps 401 responses to AUTH_EXPIRED', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 401 }),
    );

    const client = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
      },
      accessToken: 'token',
    });

    await expect(client.listAppliances()).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
    } satisfies Partial<CliError>);
  });

  it('maps 429 responses to RATE_LIMITED and exposes retry-after', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', {
        status: 429,
        headers: {
          'retry-after': '120',
        },
      }),
    );

    const client = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
      },
      accessToken: 'token',
    });

    await expect(client.listAppliances()).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      details: {
        retryAfter: '120',
      },
    } satisfies Partial<CliError>);
  });

  it('includes response body details for API write errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            key: 'SDK.Error.UnsupportedSetting',
            description: 'Setting cannot be changed in the current state',
          },
        }),
        {
          status: 400,
          headers: {
            'content-type': HOME_CONNECT_JSON_MEDIA_TYPE,
          },
        },
      ),
    );

    const client = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
      },
      accessToken: 'token',
    });

    await expect(
      client.setSetting('dishy-id', {
        key: 'BSH.Common.Setting.PowerState',
        value: 'BSH.Common.EnumType.PowerState.On',
      }),
    ).rejects.toMatchObject({
      code: 'API_ERROR',
      details: {
        status: 400,
        responseDescription: 'Setting cannot be changed in the current state',
      },
    } satisfies Partial<CliError>);
  });

  it('includes a redacted curl command for API read errors in debug mode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            key: 'SDK.Error.ActiveProgramNotSet',
            description:
              'Request cannot be performed since no active program is set.',
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': HOME_CONNECT_JSON_MEDIA_TYPE,
          },
        },
      ),
    );

    const client = new HomeConnectClient({
      profile: {
        name: 'simulator',
        environment: 'simulator',
      },
      accessToken: 'token',
      debug: true,
    });

    await expect(client.listAppliances()).rejects.toMatchObject({
      code: 'API_ERROR',
      message: 'Request cannot be performed since no active program is set.',
      details: {
        key: 'SDK.Error.ActiveProgramNotSet',
        curl: expect.stringContaining(
          'https://simulator.home-connect.com/api/homeappliances',
        ),
      },
    } satisfies Partial<CliError>);
  });

  it('prints a redacted curl command to stderr for successful read requests in debug mode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            homeappliances: [],
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': HOME_CONNECT_JSON_MEDIA_TYPE,
          },
        },
      ),
    );
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const client = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
      },
      accessToken: 'token',
      debug: true,
    });

    await client.listAppliances();

    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining('authorization: Bearer <redacted>'),
    );
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://api.home-connect.com/api/homeappliances',
      ),
    );
  });

  it('prints a redacted curl command to stderr for successful write requests in debug mode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const client = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
      },
      accessToken: 'token',
      debug: true,
    });

    await client.setSetting('dishy-id', {
      key: 'BSH.Common.Setting.PowerState',
      value: 'BSH.Common.EnumType.PowerState.On',
    });

    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining("curl -i -X 'PUT'"),
    );
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('--data'));
  });

  it('includes a redacted curl command in debug mode', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('invalid request', {
        status: 400,
      }),
    );

    const client = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
      },
      accessToken: 'token',
      debug: true,
    });

    await expect(
      client.setSetting('dishy-id', {
        key: 'BSH.Common.Setting.PowerState',
        value: 'BSH.Common.EnumType.PowerState.On',
      }),
    ).rejects.toMatchObject({
      code: 'API_ERROR',
      details: {
        status: 400,
        responseBody: 'invalid request',
        curl: expect.stringContaining('Bearer <redacted>'),
      },
    } satisfies Partial<CliError>);
  });

  it('sends the full selected program body when starting a program', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );

    const client = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
      },
      accessToken: 'token',
    });

    await client.startProgram('dishy-id', 'Dishcare.Dishwasher.Program.Eco50', [
      {
        key: 'Dishcare.Dishwasher.Option.ExtraDry',
        value: true,
      },
    ]);

    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(request?.body).toBe(
      JSON.stringify({
        data: {
          key: 'Dishcare.Dishwasher.Program.Eco50',
          options: [
            {
              key: 'Dishcare.Dishwasher.Option.ExtraDry',
              value: true,
            },
          ],
        },
      }),
    );
  });

  it('updates a selected program option via the selected option endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );

    const client = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
      },
      accessToken: 'token',
    });

    await client.setSelectedOption('dishy-id', {
      key: 'Dishcare.Dishwasher.Option.ExtraDry',
      value: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.home-connect.com/api/homeappliances/dishy-id/programs/selected/options/Dishcare.Dishwasher.Option.ExtraDry',
      expect.any(Object),
    );

    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(request?.body).toBe(
      JSON.stringify({
        data: {
          key: 'Dishcare.Dishwasher.Option.ExtraDry',
          value: true,
        },
      }),
    );
  });

  it('updates an active program option via the active option endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );

    const client = new HomeConnectClient({
      profile: {
        name: 'production',
        environment: 'production',
      },
      accessToken: 'token',
    });

    await client.setActiveOption('oven-id', {
      key: 'Cooking.Oven.Option.SetpointTemperature',
      value: 180,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.home-connect.com/api/homeappliances/oven-id/programs/active/options/Cooking.Oven.Option.SetpointTemperature',
      expect.any(Object),
    );

    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(request?.body).toBe(
      JSON.stringify({
        data: {
          key: 'Cooking.Oven.Option.SetpointTemperature',
          value: 180,
        },
      }),
    );
  });
});
