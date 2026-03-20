export type OutputFormat = 'human' | 'json' | 'jsonl';
export type ProfileName = string;
export type EnvironmentName = 'production' | 'simulator';

export interface CommandContext {
  profile: ProfileName;
  output: OutputFormat;
  interactive?: boolean;
  appliance?: string;
  debug?: boolean;
  language?: string;
}

export interface ApplianceSummary {
  id: string;
  name?: string;
  type?: string;
  brand?: string;
  vib?: string;
  connected: boolean;
}

export interface ApiItem<T = unknown> {
  key: string;
  value?: T;
  name?: string;
  displayvalue?: string;
  unit?: string;
  type?: string;
  constraints?: {
    allowedvalues?: unknown[];
    min?: number;
    max?: number;
    stepsize?: number;
    default?: unknown;
  };
}

export interface ProgramDefinition extends ApiItem {
  options?: ApiItem[];
}

export interface EventMessage {
  items: ApiItem[];
}

export interface ApplianceStatusSnapshot {
  applianceId: string;
  applianceName?: string;
  items: ApiItem[];
}

export interface ApplianceSettingSnapshot {
  applianceId: string;
  applianceName?: string;
  items: ApiItem[];
}

export interface ApplianceProgramSnapshot {
  applianceId: string;
  applianceName?: string;
  items: ProgramDefinition[];
}

export interface AuthSession {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: string;
  scope?: string;
}

export interface ProfileConfig {
  name: ProfileName;
  environment: EnvironmentName;
  language?: string;
  output?: OutputFormat;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  scope?: string;
  deviceCodeIntervalSeconds?: number;
}

export interface RateLimitState {
  retryAfter?: string;
  last429At?: string;
  lastError?: string;
  avoidableFailures: number;
}

export interface ApplianceShadow {
  appliance: ApplianceSummary;
  lastSeenAt?: string;
  statuses?: ApiItem[];
  settings?: ApiItem[];
  settingDetails?: Record<string, ApiItem>;
  availablePrograms?: ProgramDefinition[];
  selectedProgram?: ProgramDefinition;
  activeProgram?: ProgramDefinition;
  programDetails?: Record<string, ProgramDefinition>;
  freshness?: Partial<
    Record<'appliances' | 'status' | 'settings' | 'programs' | 'events', string>
  >;
}

export interface ProfileState {
  profile: ProfileConfig;
  session?: AuthSession;
  appliances: Record<string, ApplianceShadow>;
  rateLimit: RateLimitState;
}

export interface RootState {
  profiles: Record<string, ProfileState>;
}

export interface CliErrorShape {
  ok: false;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CliSuccessShape<T> {
  ok: true;
  data: T;
  warnings?: string[];
  meta?: Record<string, unknown>;
}

export type CliResult<T> = CliSuccessShape<T> | CliErrorShape;

export interface DeviceAuthorizationResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
}
