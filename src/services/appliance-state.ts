import { nowIso } from '../core/time.js';
import type {
  ApiItem,
  ApplianceShadow,
  ApplianceSummary,
  ProfileState,
  ProgramDefinition,
} from '../types.js';

export function upsertAppliances(
  profile: ProfileState,
  appliances: ApplianceSummary[],
): void {
  for (const appliance of appliances) {
    const existing = profile.appliances[appliance.id];
    profile.appliances[appliance.id] = {
      ...(existing ?? { appliance, programDetails: {} }),
      appliance,
      lastSeenAt: nowIso(),
      freshness: {
        ...(existing?.freshness ?? {}),
        appliances: nowIso(),
      },
    } satisfies ApplianceShadow;
  }
}

export function storeStatuses(
  profile: ProfileState,
  applianceId: string,
  items: ApiItem[],
): void {
  const appliance = profile.appliances[applianceId];
  appliance.statuses = items;
  appliance.freshness = {
    ...(appliance.freshness ?? {}),
    status: nowIso(),
  };
}

export function storeSettings(
  profile: ProfileState,
  applianceId: string,
  items: ApiItem[],
): void {
  const appliance = profile.appliances[applianceId];
  appliance.settings = items;
  appliance.settingDetails = {
    ...(appliance.settingDetails ?? {}),
    ...Object.fromEntries(items.map((item) => [item.key, item])),
  };
  appliance.freshness = {
    ...(appliance.freshness ?? {}),
    settings: nowIso(),
  };
}

export function storeSettingDetail(
  profile: ProfileState,
  applianceId: string,
  item: ApiItem,
): void {
  const appliance = profile.appliances[applianceId];
  appliance.settingDetails = {
    ...(appliance.settingDetails ?? {}),
    [item.key]: item,
  };
  if (appliance.settings) {
    const index = appliance.settings.findIndex(
      (setting) => setting.key === item.key,
    );
    if (index >= 0) {
      appliance.settings[index] = item;
    }
  }
  appliance.freshness = {
    ...(appliance.freshness ?? {}),
    settings: nowIso(),
  };
}

export function applySettingValues(
  profile: ProfileState,
  applianceId: string,
  currentSettings: ApiItem[],
  payload: Array<{ key: string; value: unknown }>,
): void {
  const appliance = profile.appliances[applianceId];
  appliance.settings = (appliance.settings ?? currentSettings).map(
    (existing) => {
      const updated = payload.find((setting) => setting.key === existing.key);
      return updated ? { ...existing, value: updated.value } : existing;
    },
  );
  appliance.settingDetails = {
    ...(appliance.settingDetails ?? {}),
    ...Object.fromEntries(
      payload.map((setting) => [
        setting.key,
        {
          ...(appliance.settingDetails?.[setting.key] ??
            currentSettings.find((item) => item.key === setting.key) ?? {
              key: setting.key,
            }),
          value: setting.value,
        },
      ]),
    ),
  };
  appliance.freshness = {
    ...(appliance.freshness ?? {}),
    settings: nowIso(),
  };
}

export function storeAvailablePrograms(
  profile: ProfileState,
  applianceId: string,
  items: ProgramDefinition[],
): void {
  const appliance = profile.appliances[applianceId];
  appliance.availablePrograms = items;
  appliance.freshness = {
    ...(appliance.freshness ?? {}),
    programs: nowIso(),
  };
}

export function storeProgramDetail(
  profile: ProfileState,
  applianceId: string,
  programKey: string,
  program: ProgramDefinition,
): void {
  const appliance = profile.appliances[applianceId];
  appliance.programDetails = {
    ...(appliance.programDetails ?? {}),
    [programKey]: program,
  };
}

export function storeSelectedProgram(
  profile: ProfileState,
  applianceId: string,
  program: ProgramDefinition,
): void {
  profile.appliances[applianceId].selectedProgram = program;
}

export function storeActiveProgram(
  profile: ProfileState,
  applianceId: string,
  program: ProgramDefinition,
): void {
  profile.appliances[applianceId].activeProgram = program;
}

export function touchEvents(profile: ProfileState, applianceId: string): void {
  profile.appliances[applianceId].freshness = {
    ...(profile.appliances[applianceId].freshness ?? {}),
    events: nowIso(),
  };
}
