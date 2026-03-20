import type {
  ApiItem,
  ApplianceProgramSnapshot,
  ApplianceSettingSnapshot,
  ApplianceStatusSnapshot,
  ApplianceSummary,
  EventMessage,
  ProfileConfig,
  ProgramDefinition,
} from '../../types.js';
import { formatKeyValue, formatTable } from './table.js';
import {
  formatConstrainedItemValue,
  formatOptionConstraints,
  renderItemValue,
} from './value-rendering.js';

interface AuthStatusShape {
  profile: string;
  environment: string;
  clientId?: string;
  redirectUri?: string;
  configuredScope?: string;
  sessionScope?: string;
  authenticated: boolean;
  expiresAt?: string;
  rateLimitRetryAfter?: string;
}

interface ActionResultShape {
  appliance?: string;
  program?: string;
  settings?: string[];
  options?: string[];
  command?: string;
}

interface EventEnvelopeShape {
  appliance: string;
  event: EventMessage;
}

export function formatHuman(data: unknown): string {
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return 'No results.';
    }
    if (isApplianceSummaryArray(data)) {
      return formatTable(
        ['ID', 'TYPE', 'NAME', 'CONNECTED'],
        data.map((item) => [
          item.id,
          item.type ?? '',
          item.name ?? '',
          String(item.connected),
        ]),
      );
    }
    if (isApplianceSnapshotArray(data)) {
      return formatApplianceSnapshots(data);
    }
    if (isProgramListArray(data)) {
      return formatTable(
        ['PROGRAM'],
        data.map((item) => [item.name ?? item.displayvalue ?? item.key]),
      );
    }
    if (isSettingItemArray(data)) {
      return formatTable(
        ['SETTING', 'TYPE', 'VALUE'],
        data.map((item) => [
          item.name ?? item.key,
          item.type ?? '',
          formatConstrainedItemValue(item),
        ]),
      );
    }
    if (isApiItemArray(data)) {
      return formatTable(
        ['NAME', 'VALUE'],
        data.map((item) => [item.name ?? item.key, renderItemValue(item)]),
      );
    }
  }

  if (isProgramDefinition(data)) {
    return formatProgramDefinition(data);
  }

  if (isSettingItem(data)) {
    return formatTable(
      ['SETTING', 'TYPE', 'VALUE'],
      [
        [
          data.name ?? data.key,
          data.type ?? '',
          formatConstrainedItemValue(data),
        ],
      ],
    );
  }

  if (isApplianceSummary(data)) {
    return formatApplianceSummary(data);
  }

  if (isAuthStatus(data)) {
    return formatAuthStatus(data);
  }

  if (isProfileConfig(data)) {
    return formatProfileConfig(data);
  }

  if (isActionResult(data)) {
    return formatActionResult(data);
  }

  if (isEventEnvelope(data)) {
    return formatEventEnvelope(data);
  }

  return JSON.stringify(data, null, 2);
}

function formatProgramDefinition(program: ProgramDefinition): string {
  const lines = [
    `PROGRAM: ${program.name ?? program.displayvalue ?? program.key}`,
    `KEY: ${program.key}`,
  ];

  if (!program.options || program.options.length === 0) {
    lines.push('', 'OPTIONS: none');
    return lines.join('\n');
  }

  lines.push(
    '',
    formatTable(
      ['OPTION', 'TYPE', 'VALUE'],
      program.options.map((option) => [
        option.name ?? option.key,
        option.type ?? '',
        formatOptionConstraints(option),
      ]),
    ),
  );

  return lines.join('\n');
}

function formatApplianceSummary(appliance: ApplianceSummary): string {
  return formatKeyValue([
    ['ID', appliance.id],
    ['NAME', appliance.name ?? ''],
    ['TYPE', appliance.type ?? ''],
    ['BRAND', appliance.brand ?? ''],
    ['VIB', appliance.vib ?? ''],
    ['CONNECTED', String(appliance.connected)],
  ]);
}

function formatAuthStatus(data: AuthStatusShape): string {
  return formatKeyValue([
    ['PROFILE', data.profile],
    ['ENVIRONMENT', data.environment],
    ['CLIENT ID', data.clientId ?? ''],
    ['REDIRECT URI', data.redirectUri ?? ''],
    ['AUTHENTICATED', String(data.authenticated)],
    ['EXPIRES AT', data.expiresAt ?? ''],
    ['CONFIGURED SCOPE', data.configuredScope ?? ''],
    ['SESSION SCOPE', data.sessionScope ?? ''],
    ['RETRY AFTER', data.rateLimitRetryAfter ?? ''],
  ]);
}

function formatProfileConfig(data: ProfileConfig): string {
  return formatKeyValue([
    ['PROFILE', data.name],
    ['ENVIRONMENT', data.environment],
    ['LANGUAGE', data.language ?? ''],
    ['OUTPUT', data.output ?? ''],
    ['CLIENT ID', data.clientId ?? ''],
    ['REDIRECT URI', data.redirectUri ?? ''],
    ['SCOPE', data.scope ?? ''],
  ]);
}

function formatActionResult(data: ActionResultShape): string {
  const rows: Array<[string, string]> = [];
  if (data.appliance) {
    rows.push(['APPLIANCE', data.appliance]);
  }
  if (data.program) {
    rows.push(['PROGRAM', data.program]);
  }
  if (data.settings?.length) {
    rows.push(['SETTINGS', data.settings.join(', ')]);
  }
  if (data.options?.length) {
    rows.push(['OPTIONS', data.options.join(', ')]);
  }
  if (data.command) {
    rows.push(['COMMAND', data.command]);
  }
  return formatKeyValue(rows);
}

function formatEventEnvelope(data: EventEnvelopeShape): string {
  const separator = `----- ${new Date().toISOString()} -----`;
  const firstItem = data.event.items[0];
  if (!firstItem) {
    return `${separator}\n${formatKeyValue([['APPLIANCE', data.appliance]])}`;
  }

  const rows: Array<[string, string]> = [
    ['APPLIANCE', data.appliance],
    ['EVENT', firstItem.key],
    ['ITEM', firstItem.name ?? firstItem.key],
    ['VALUE', renderItemValue(firstItem)],
  ];

  return `${separator}\n${formatKeyValue(rows)}`;
}

function formatApplianceSnapshots(
  data:
    | ApplianceStatusSnapshot[]
    | ApplianceSettingSnapshot[]
    | ApplianceProgramSnapshot[],
): string {
  const kind = detectApplianceSnapshotKind(data);

  if (kind === 'setting') {
    return formatTable(
      ['APPLIANCE', 'NAME', 'SETTING', 'TYPE', 'VALUE'],
      data.flatMap((snapshot) =>
        snapshot.items.map((item) => [
          snapshot.applianceId,
          snapshot.applianceName ?? '',
          item.name ?? item.key,
          item.type ?? '',
          formatConstrainedItemValue(item),
        ]),
      ),
    );
  }

  if (kind === 'program') {
    return formatTable(
      ['APPLIANCE', 'NAME', 'PROGRAM'],
      data.flatMap((snapshot) =>
        snapshot.items.map((item) => [
          snapshot.applianceId,
          snapshot.applianceName ?? '',
          item.name ?? item.displayvalue ?? item.key,
        ]),
      ),
    );
  }

  return formatTable(
    ['APPLIANCE', 'NAME', 'STATUS', 'VALUE'],
    data.flatMap((snapshot) =>
      snapshot.items.map((item) => [
        snapshot.applianceId,
        snapshot.applianceName ?? '',
        item.name ?? item.key,
        renderItemValue(item),
      ]),
    ),
  );
}

function detectApplianceSnapshotKind(
  data:
    | ApplianceStatusSnapshot[]
    | ApplianceSettingSnapshot[]
    | ApplianceProgramSnapshot[],
): 'status' | 'setting' | 'program' {
  for (const snapshot of data) {
    const firstItem = snapshot.items[0];
    if (!firstItem) {
      continue;
    }
    if (
      typeof firstItem.key === 'string' &&
      firstItem.key.includes('.Program.')
    ) {
      return 'program';
    }
    if (
      typeof firstItem.key === 'string' &&
      firstItem.key.includes('.Setting.')
    ) {
      return 'setting';
    }
    return 'status';
  }

  return 'status';
}

function isApplianceSummaryArray(data: unknown[]): data is ApplianceSummary[] {
  return data.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      'id' in item &&
      'connected' in item,
  );
}

function isApplianceSummary(data: unknown): data is ApplianceSummary {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    'connected' in data
  );
}

function isApiItemArray(data: unknown[]): data is ApiItem[] {
  return data.every(
    (item) => typeof item === 'object' && item !== null && 'key' in item,
  );
}

function isProgramDefinition(data: unknown): data is ProgramDefinition {
  return (
    typeof data === 'object' &&
    data !== null &&
    'key' in data &&
    typeof data.key === 'string' &&
    data.key.includes('.Program.')
  );
}

function isAuthStatus(data: unknown): data is AuthStatusShape {
  return (
    typeof data === 'object' &&
    data !== null &&
    'profile' in data &&
    'environment' in data &&
    'authenticated' in data
  );
}

function isProfileConfig(data: unknown): data is ProfileConfig {
  return (
    typeof data === 'object' &&
    data !== null &&
    'name' in data &&
    'environment' in data
  );
}

function isActionResult(data: unknown): data is ActionResultShape {
  return (
    typeof data === 'object' &&
    data !== null &&
    'command' in data &&
    (('appliance' in data && typeof data.appliance === 'string') ||
      ('program' in data && typeof data.program === 'string') ||
      ('settings' in data && Array.isArray(data.settings)) ||
      ('options' in data && Array.isArray(data.options)))
  );
}

function isEventEnvelope(data: unknown): data is EventEnvelopeShape {
  return (
    typeof data === 'object' &&
    data !== null &&
    'appliance' in data &&
    'event' in data &&
    typeof data.appliance === 'string' &&
    typeof data.event === 'object' &&
    data.event !== null &&
    'items' in data.event &&
    Array.isArray(data.event.items)
  );
}

function isProgramListArray(data: unknown[]): data is ProgramDefinition[] {
  return data.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      'key' in item &&
      typeof item.key === 'string' &&
      item.key.includes('.Program.'),
  );
}

function isSettingItemArray(data: unknown[]): data is ApiItem[] {
  return data.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      'key' in item &&
      typeof item.key === 'string' &&
      item.key.includes('.Setting.'),
  );
}

function isSettingItem(data: unknown): data is ApiItem {
  return (
    typeof data === 'object' &&
    data !== null &&
    'key' in data &&
    typeof data.key === 'string' &&
    data.key.includes('.Setting.')
  );
}

function isApplianceSnapshotArray(
  data: unknown[],
): data is
  | ApplianceStatusSnapshot[]
  | ApplianceSettingSnapshot[]
  | ApplianceProgramSnapshot[] {
  return data.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      'applianceId' in item &&
      'items' in item,
  );
}
