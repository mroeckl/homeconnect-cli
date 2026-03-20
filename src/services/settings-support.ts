import { parseAssignment } from '../core/parse.js';
import type { StateStore } from '../storage/state-store.js';
import type {
  ApiItem,
  ApplianceSettingSnapshot,
  EnvironmentName,
  ProfileState,
} from '../types.js';
import {
  applySettingValues,
  storeSettingDetail,
  storeSettings,
} from './appliance-state.js';
import {
  resolveApplianceSelectorFromProfile,
  resolveFeatureSelector,
} from './completion-matching.js';
import type { GuardEngine } from './guard-engine.js';
import type { SessionSupport } from './session-support.js';

interface SettingsSupportOptions {
  store: StateStore;
  sessionSupport: SessionSupport;
  guard: GuardEngine;
  profileName: string;
  environment: EnvironmentName;
  refreshApplianceReadiness: (applianceId: string) => Promise<ProfileState>;
  collectConnectedApplianceSnapshots: <T>(
    loader: (appliance: { id: string; name?: string }) => Promise<T>,
  ) => Promise<T[]>;
}

export class SettingsSupport {
  private readonly store: StateStore;
  private readonly sessionSupport: SessionSupport;
  private readonly guard: GuardEngine;
  private readonly profileName: string;
  private readonly environment: EnvironmentName;
  private readonly refreshApplianceReadiness: (
    applianceId: string,
  ) => Promise<ProfileState>;
  private readonly collectConnectedApplianceSnapshots: <T>(
    loader: (appliance: { id: string; name?: string }) => Promise<T>,
  ) => Promise<T[]>;

  constructor(options: SettingsSupportOptions) {
    this.store = options.store;
    this.sessionSupport = options.sessionSupport;
    this.guard = options.guard;
    this.profileName = options.profileName;
    this.environment = options.environment;
    this.refreshApplianceReadiness = options.refreshApplianceReadiness;
    this.collectConnectedApplianceSnapshots =
      options.collectConnectedApplianceSnapshots;
  }

  async listSettings(applianceId: string): Promise<ApiItem[]> {
    const profile = await this.refreshApplianceReadiness(applianceId);
    const items = await this.sessionSupport.executeApiCall(profile, (client) =>
      client.listSettings(applianceId),
    );
    await this.store.mutateProfile(
      this.profileName,
      this.environment,
      (draft) => storeSettings(draft, applianceId, items),
    );
    return items;
  }

  async listAllSettings(): Promise<ApplianceSettingSnapshot[]> {
    return this.collectConnectedApplianceSnapshots((appliance) =>
      this.listSettings(appliance.id).then((items) => ({
        applianceId: appliance.id,
        applianceName: appliance.name,
        items,
      })),
    );
  }

  async getSetting(applianceId: string, settingKey: string): Promise<ApiItem> {
    const profile = await this.refreshApplianceReadiness(applianceId);
    const item = await this.sessionSupport.executeApiCall(profile, (client) =>
      client.getSetting(applianceId, settingKey),
    );
    await this.store.mutateProfile(
      this.profileName,
      this.environment,
      (draft) => storeSettingDetail(draft, applianceId, item),
    );
    return item;
  }

  async resolveSettingForCompletion(
    profile: ProfileState,
    normalizedTokens: string[],
    assignmentToken: string,
  ): Promise<ApiItem | undefined> {
    const applianceFlagIndex = normalizedTokens.lastIndexOf('--appliance');
    if (applianceFlagIndex < 0) {
      return undefined;
    }

    const applianceId = resolveApplianceSelectorFromProfile(
      profile,
      normalizedTokens[applianceFlagIndex + 1],
    );
    if (!applianceId) {
      return undefined;
    }

    const [settingSelector] = assignmentToken.split('=', 2);
    const settings = profile.appliances[applianceId]?.settings ?? [];
    const setting = resolveFeatureSelector(settings, settingSelector);
    if (!setting) {
      return undefined;
    }

    const cachedDetail =
      profile.appliances[applianceId]?.settingDetails?.[setting.key];
    if (cachedDetail?.constraints?.allowedvalues?.length) {
      return cachedDetail;
    }

    return this.getSetting(applianceId, setting.key);
  }

  async ensureSettingsLoadedForCompletion(
    profile: ProfileState,
    normalizedTokens: string[],
  ): Promise<ProfileState> {
    const applianceFlagIndex = normalizedTokens.lastIndexOf('--appliance');
    if (applianceFlagIndex < 0) {
      return profile;
    }

    const applianceId = resolveApplianceSelectorFromProfile(
      profile,
      normalizedTokens[applianceFlagIndex + 1],
    );
    if (!applianceId) {
      return profile;
    }

    const cachedSettings = profile.appliances[applianceId]?.settings ?? [];
    if (cachedSettings.length > 0) {
      return profile;
    }

    await this.listSettings(applianceId);
    return this.store.requireSession(this.profileName, this.environment);
  }

  async setSettings(
    applianceId: string,
    rawSettings: string[],
    parsePrimitive: (raw: string) => string | number | boolean,
  ): Promise<ApiItem[]> {
    const assignments = rawSettings.map((input) =>
      parseAssignment(input, 'setting'),
    );
    const currentSettings = await this.listSettings(applianceId);
    const profile = await this.store.requireSession(
      this.profileName,
      this.environment,
    );
    this.guard.validateSettings(currentSettings, assignments);
    const payload = assignments.map((assignment) => ({
      key: assignment.key,
      value: parsePrimitive(assignment.value),
    }));
    for (const setting of payload) {
      await this.sessionSupport.executeApiCall(profile, (client) =>
        client.setSetting(applianceId, setting),
      );
    }

    await this.store.mutateProfile(
      this.profileName,
      this.environment,
      (draft) =>
        applySettingValues(draft, applianceId, currentSettings, payload),
    );

    return (
      (await this.store.requireSession(this.profileName, this.environment))
        .appliances[applianceId]?.settings ?? currentSettings
    );
  }
}
