import { CliError } from '../core/errors.js';
import {
  DEFAULT_HOME_CONNECT_SCOPE,
  DEFAULT_REDIRECT_URI,
  HOME_CONNECT_JSON_MEDIA_TYPE,
} from '../core/home-connect-defaults.js';
import type {
  ApiItem,
  ApplianceSummary,
  DeviceAuthorizationResponse,
  EventMessage,
  ProfileConfig,
  ProgramDefinition,
  TokenResponse,
} from '../types.js';

interface ClientOptions {
  profile: ProfileConfig;
  accessToken?: string;
  debug?: boolean;
  language?: string;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: {
    key?: string;
    description?: string;
  };
}

const ENVIRONMENT_BASE_URL: Record<string, string> = {
  production: 'https://api.home-connect.com',
  simulator: 'https://simulator.home-connect.com',
};

function toApplianceSummary(raw: Record<string, unknown>): ApplianceSummary {
  return {
    id: String(raw.haId ?? raw.id),
    name: raw.name ? String(raw.name) : undefined,
    type: raw.type ? String(raw.type) : undefined,
    brand: raw.brand ? String(raw.brand) : undefined,
    vib: raw.vib ? String(raw.vib) : undefined,
    connected: Boolean(raw.connected),
  };
}

function encodeBody(body: Record<string, unknown>): string {
  return JSON.stringify(body);
}

export class HomeConnectClient {
  private readonly profile: ProfileConfig;
  private readonly accessToken?: string;
  private readonly apiBaseUrl: string;
  private readonly oauthBaseUrl: string;
  private readonly debug: boolean;
  private readonly language?: string;

  constructor(options: ClientOptions) {
    this.profile = options.profile;
    this.accessToken = options.accessToken;
    this.debug = options.debug ?? false;
    this.language = options.language ?? options.profile.language;
    this.apiBaseUrl =
      ENVIRONMENT_BASE_URL[options.profile.environment] ??
      ENVIRONMENT_BASE_URL.production;
    this.oauthBaseUrl = `${this.apiBaseUrl}/security/oauth`;
  }

  getAuthorizationUrl(): string {
    if (!this.profile.clientId) {
      throw new CliError(
        'CLIENT_CONFIG_REQUIRED',
        'Missing clientId for OAuth login',
      );
    }

    const url = new URL(`${this.oauthBaseUrl}/authorize`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.profile.clientId);
    url.searchParams.set(
      'redirect_uri',
      this.profile.redirectUri ?? DEFAULT_REDIRECT_URI,
    );
    url.searchParams.set(
      'scope',
      this.profile.scope ?? DEFAULT_HOME_CONNECT_SCOPE,
    );
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string): Promise<TokenResponse> {
    return this.requestToken({
      grant_type: 'authorization_code',
      code,
      client_id: this.profile.clientId,
      client_secret: this.profile.clientSecret,
      redirect_uri: this.profile.redirectUri ?? DEFAULT_REDIRECT_URI,
    });
  }

  async requestDeviceCode(): Promise<DeviceAuthorizationResponse> {
    if (!this.profile.clientId) {
      throw new CliError(
        'CLIENT_CONFIG_REQUIRED',
        'Missing clientId for device login',
      );
    }

    const response = await fetch(`${this.oauthBaseUrl}/device_authorization`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.profile.clientId,
        scope: this.profile.scope ?? DEFAULT_HOME_CONNECT_SCOPE,
      }),
    });

    if (!response.ok) {
      throw new CliError(
        'AUTH_FAILED',
        `Device authorization failed with status ${response.status}`,
      );
    }

    return (await response.json()) as DeviceAuthorizationResponse;
  }

  async pollDeviceToken(deviceCode: string): Promise<TokenResponse> {
    return this.requestToken({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
      client_id: this.profile.clientId,
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
    return this.requestToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.profile.clientId,
      client_secret: this.profile.clientSecret,
    });
  }

  async listAppliances(): Promise<ApplianceSummary[]> {
    const data = await this.getCollection<Record<string, unknown>>(
      '/api/homeappliances',
      ['homeappliances'],
    );
    return data.map(toApplianceSummary);
  }

  async getAppliance(applianceId: string): Promise<ApplianceSummary> {
    const appliances = await this.listAppliances();
    const appliance = appliances.find(
      (candidate) => candidate.id === applianceId,
    );
    if (!appliance) {
      throw new CliError(
        'APPLIANCE_UNKNOWN',
        `Appliance ${applianceId} was not returned by the API`,
        { appliance: applianceId },
      );
    }
    return appliance;
  }

  async listStatus(applianceId: string): Promise<ApiItem[]> {
    return this.getCollection<ApiItem>(
      `/api/homeappliances/${applianceId}/status`,
      ['status'],
    );
  }

  async listSettings(applianceId: string): Promise<ApiItem[]> {
    return this.getCollection<ApiItem>(
      `/api/homeappliances/${applianceId}/settings`,
      ['settings'],
    );
  }

  async getSetting(applianceId: string, settingKey: string): Promise<ApiItem> {
    return this.get<ApiItem>(
      `/api/homeappliances/${applianceId}/settings/${encodeURIComponent(settingKey)}`,
    );
  }

  async setSetting(applianceId: string, setting: ApiItem): Promise<void> {
    await this.put(
      `/api/homeappliances/${applianceId}/settings/${encodeURIComponent(setting.key)}`,
      {
        data: {
          key: setting.key,
          value: setting.value,
        },
      },
    );
  }

  async listPrograms(applianceId: string): Promise<ProgramDefinition[]> {
    return this.getCollection<ProgramDefinition>(
      `/api/homeappliances/${applianceId}/programs/available`,
      ['programs'],
    );
  }

  async getProgram(
    applianceId: string,
    programKey: string,
  ): Promise<ProgramDefinition> {
    const data = await this.get<ProgramDefinition>(
      `/api/homeappliances/${applianceId}/programs/available/${encodeURIComponent(programKey)}`,
    );
    return data;
  }

  async getSelectedProgram(applianceId: string): Promise<ProgramDefinition> {
    return this.get<ProgramDefinition>(
      `/api/homeappliances/${applianceId}/programs/selected`,
    );
  }

  async getActiveProgram(applianceId: string): Promise<ProgramDefinition> {
    return this.get<ProgramDefinition>(
      `/api/homeappliances/${applianceId}/programs/active`,
    );
  }

  async selectProgram(
    applianceId: string,
    programKey: string,
    options: ApiItem[],
  ): Promise<void> {
    await this.put(`/api/homeappliances/${applianceId}/programs/selected`, {
      data: {
        key: programKey,
        options,
      },
    });
  }

  async setSelectedOption(applianceId: string, option: ApiItem): Promise<void> {
    await this.put(
      `/api/homeappliances/${applianceId}/programs/selected/options/${encodeURIComponent(option.key)}`,
      {
        data: {
          key: option.key,
          value: option.value,
        },
      },
    );
  }

  async setActiveProgram(
    applianceId: string,
    programKey: string,
    options: ApiItem[],
  ): Promise<void> {
    await this.put(`/api/homeappliances/${applianceId}/programs/active`, {
      data: {
        key: programKey,
        options,
      },
    });
  }

  async setActiveOption(applianceId: string, option: ApiItem): Promise<void> {
    await this.put(
      `/api/homeappliances/${applianceId}/programs/active/options/${encodeURIComponent(option.key)}`,
      {
        data: {
          key: option.key,
          value: option.value,
        },
      },
    );
  }

  async startProgram(
    applianceId: string,
    programKey: string,
    options: ApiItem[] = [],
  ): Promise<void> {
    await this.put(`/api/homeappliances/${applianceId}/programs/active`, {
      data: {
        key: programKey,
        options,
      },
    });
  }

  async stopProgram(applianceId: string): Promise<void> {
    await this.delete(`/api/homeappliances/${applianceId}/programs/active`);
  }

  async *streamEvents(applianceId: string): AsyncGenerator<EventMessage> {
    const response = await this.fetchWithAuth(
      `/api/homeappliances/${applianceId}/events`,
      {
        headers: {
          accept: 'text/event-stream',
        },
      },
    );
    const reader = response.body?.getReader();
    if (!reader) {
      throw new CliError(
        'EVENT_STREAM_FAILED',
        'Event stream is not available',
      );
    }

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const lines = chunk
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        const dataLine = lines.find((line) => line.startsWith('data:'));
        if (!dataLine) {
          continue;
        }
        const payload = dataLine.slice(5).trim();
        if (!payload) {
          continue;
        }
        yield JSON.parse(payload) as EventMessage;
      }
    }
  }

  private async requestToken(
    fields: Record<string, string | undefined>,
  ): Promise<TokenResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      if (value) {
        params.set(key, value);
      }
    }

    const response = await fetch(`${this.oauthBaseUrl}/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: params,
    });

    if (!response.ok) {
      throw new CliError(
        'AUTH_FAILED',
        `Token request failed with status ${response.status}`,
      );
    }

    return (await response.json()) as TokenResponse;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchWithAuth(path);
    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (envelope.error) {
      throw new CliError(
        'API_ERROR',
        envelope.error.description ?? 'Home Connect API error',
        this.buildEnvelopeErrorDetails(path, envelope.error.key),
      );
    }
    if (envelope.data === undefined) {
      throw new CliError('API_ERROR', 'Home Connect API returned no data');
    }
    return envelope.data;
  }

  private async getCollection<T>(
    path: string,
    expectedKeys: string[],
  ): Promise<T[]> {
    const data = await this.get<Record<string, unknown>>(path);

    for (const key of expectedKeys) {
      const value = data[key];
      if (Array.isArray(value)) {
        return value as T[];
      }
    }

    const firstArray = Object.values(data).find(Array.isArray);
    if (Array.isArray(firstArray)) {
      return firstArray as T[];
    }

    throw new CliError(
      'API_ERROR',
      'Home Connect API returned no collection data',
      {
        path,
        expectedKeys,
        dataKeys: Object.keys(data),
      },
    );
  }

  private async put(
    path: string,
    body: Record<string, unknown>,
  ): Promise<void> {
    const init: RequestInit = {
      method: 'PUT',
      headers: {
        'content-type': HOME_CONNECT_JSON_MEDIA_TYPE,
      },
      body: encodeBody(body),
    };
    const response = await this.fetchWithAuth(path, init);

    if (!response.ok) {
      throw new CliError(
        response.status === 429 ? 'RATE_LIMITED' : 'API_ERROR',
        `Request failed with status ${response.status}`,
        await this.buildErrorDetails(path, response, init),
      );
    }
  }

  private async delete(path: string): Promise<void> {
    const init: RequestInit = { method: 'DELETE' };
    const response = await this.fetchWithAuth(path, init);
    if (!response.ok) {
      throw new CliError(
        'API_ERROR',
        `Request failed with status ${response.status}`,
        await this.buildErrorDetails(path, response, init),
      );
    }
  }

  private async fetchWithAuth(
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    if (!this.accessToken) {
      throw new CliError(
        'AUTH_REQUIRED',
        'No access token is available for this profile',
      );
    }

    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${this.accessToken}`);
    headers.set(
      'accept',
      headers.get('accept') ?? HOME_CONNECT_JSON_MEDIA_TYPE,
    );
    if (this.language) {
      headers.set('accept-language', this.language);
    }

    if (this.debug) {
      process.stderr.write(
        `${this.buildCurlCommand(path, { ...init, headers })}\n`,
      );
    }

    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers,
    });

    if (response.status === 401) {
      throw new CliError('AUTH_EXPIRED', 'Access token is expired or invalid');
    }

    if (response.status === 429) {
      throw new CliError(
        'RATE_LIMITED',
        'Request failed with status 429',
        await this.buildErrorDetails(path, response, init),
      );
    }

    return response;
  }

  private async buildErrorDetails(
    path: string,
    response: Response,
    init: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    const responseBody = await parseResponseBody(response);
    const responseDescription = extractResponseDescription(responseBody);
    const details: Record<string, unknown> = {
      status: response.status,
      statusText: response.statusText || undefined,
      retryAfter: response.headers.get('retry-after') || undefined,
      responseDescription,
      responseBody: responseDescription ? undefined : responseBody,
    };

    if (this.debug) {
      details.curl = this.buildCurlCommand(path, init);
    }

    return details;
  }

  private buildEnvelopeErrorDetails(
    path: string,
    key: string | undefined,
  ): Record<string, unknown> {
    const details: Record<string, unknown> = {
      key,
    };

    if (this.debug) {
      details.curl = this.buildCurlCommand(path);
    }

    return details;
  }

  private buildCurlCommand(path: string, init: RequestInit = {}): string {
    const method = init.method ?? 'GET';
    const url = `${this.apiBaseUrl}${path}`;
    const headers = new Headers(init.headers);
    headers.set('authorization', 'Bearer <redacted>');
    headers.set(
      'accept',
      headers.get('accept') ?? HOME_CONNECT_JSON_MEDIA_TYPE,
    );

    const parts = ['curl', '-i', '-X', shellEscape(method)];
    for (const [key, value] of headers.entries()) {
      parts.push('-H', shellEscape(`${key}: ${value}`));
    }

    if (init.body) {
      parts.push('--data', shellEscape(String(init.body)));
    }

    parts.push(shellEscape(url));
    return parts.join(' ');
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractResponseDescription(responseBody: unknown): string | undefined {
  if (
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'error' in responseBody
  ) {
    const error = (responseBody as Record<string, unknown>).error;
    if (
      typeof error === 'object' &&
      error !== null &&
      'description' in error &&
      typeof (error as Record<string, unknown>).description === 'string'
    ) {
      return (error as Record<string, unknown>).description as string;
    }
  }

  return undefined;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
