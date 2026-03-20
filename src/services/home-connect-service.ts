import { CliError } from '../core/errors.js';
import type { StateStore } from '../storage/state-store.js';
import { createEmptyProfileState } from '../storage/state-store.js';
import type {
  ApiItem,
  ApplianceProgramSnapshot,
  ApplianceSettingSnapshot,
  ApplianceStatusSnapshot,
  ApplianceSummary,
  DeviceAuthorizationResponse,
  EnvironmentName,
  EventMessage,
  ProfileConfig,
  ProfileState,
  ProgramDefinition,
} from '../types.js';
import { storeStatuses, upsertAppliances } from './appliance-state.js';
import {
  type ClientFactory,
  createDefaultClientFactory,
} from './client-factory.js';
import {
  completionSuggestions as buildCompletionSuggestions,
  resolveApplianceSelectorFromProfile,
} from './completion.js';
import { GuardEngine } from './guard-engine.js';
import {
  type ProgramInteractionMode,
  ProgramSupport,
} from './program-support.js';
import { RequestPolicy } from './request-policy.js';
import {
  assignmentsToItems,
  parsePrimitive,
  sleep,
} from './service-utilities.js';
import { SessionSupport } from './session-support.js';
import { SettingsSupport } from './settings-support.js';

interface ServiceOptions {
  store: StateStore;
  profileName: string;
  environment: EnvironmentName;
  debug?: boolean;
  language?: string;
  clientFactory?: ClientFactory;
}
export class HomeConnectService {
  private readonly store: StateStore;
  private readonly profileName: string;
  private readonly environment: EnvironmentName;
  private readonly sessionSupport: SessionSupport;
  private readonly settingsSupport: SettingsSupport;
  private readonly programSupport: ProgramSupport;
  private readonly guard = new GuardEngine();
  private readonly requestPolicy = new RequestPolicy();

  constructor(options: ServiceOptions) {
    this.store = options.store;
    this.profileName = options.profileName;
    this.environment = options.environment;
    this.sessionSupport = new SessionSupport({
      store: options.store,
      profileName: options.profileName,
      environment: options.environment,
      debug: options.debug ?? false,
      language: options.language,
      clientFactory: options.clientFactory ?? createDefaultClientFactory(),
      requestPolicy: this.requestPolicy,
    });
    this.settingsSupport = new SettingsSupport({
      store: options.store,
      sessionSupport: this.sessionSupport,
      guard: this.guard,
      profileName: options.profileName,
      environment: options.environment,
      refreshApplianceReadiness: (applianceId) =>
        this.refreshApplianceReadiness(applianceId),
      collectConnectedApplianceSnapshots: (loader) =>
        this.collectConnectedApplianceSnapshots(loader),
    });
    this.programSupport = new ProgramSupport({
      store: options.store,
      sessionSupport: this.sessionSupport,
      guard: this.guard,
      profileName: options.profileName,
      environment: options.environment,
      refreshApplianceReadiness: (applianceId) =>
        this.refreshApplianceReadiness(applianceId),
      collectConnectedApplianceSnapshots: (loader) =>
        this.collectConnectedApplianceSnapshots(loader),
      assignmentsToItems,
    });
  }

  async getProfile(): Promise<ProfileState> {
    return this.sessionSupport.getProfile();
  }

  async configureProfile(patch: Partial<ProfileConfig>): Promise<ProfileState> {
    return this.sessionSupport.configureProfile(patch);
  }

  async getAuthorizationUrl(
    clientConfig?: Partial<ProfileConfig>,
  ): Promise<string> {
    const profile = await this.sessionSupport.ensureProfileConfig(clientConfig);
    return this.sessionSupport.createClient(profile).getAuthorizationUrl();
  }

  async exchangeAuthorizationCode(
    code: string,
    clientConfig?: Partial<ProfileConfig>,
  ) {
    const profile = await this.sessionSupport.ensureProfileConfig(clientConfig);
    const token = await this.sessionSupport
      .createClient(profile)
      .exchangeAuthorizationCode(code);
    return this.sessionSupport.persistToken(token);
  }

  async requestDeviceCode(
    clientConfig?: Partial<ProfileConfig>,
  ): Promise<DeviceAuthorizationResponse> {
    const profile = await this.sessionSupport.ensureProfileConfig(clientConfig);
    return this.sessionSupport.createClient(profile).requestDeviceCode();
  }

  async exchangeDeviceCode(
    deviceCode: string,
    clientConfig?: Partial<ProfileConfig>,
    intervalSeconds = 5,
    timeoutSeconds = 300,
  ) {
    const profile = await this.sessionSupport.ensureProfileConfig(clientConfig);
    const client = this.sessionSupport.createClient(profile);
    const deadline = Date.now() + timeoutSeconds * 1000;

    while (Date.now() < deadline) {
      try {
        const token = await client.pollDeviceToken(deviceCode);
        return this.sessionSupport.persistToken(token);
      } catch (error) {
        if (error instanceof CliError && error.message.includes('status 400')) {
          await sleep(intervalSeconds * 1000);
          continue;
        }
        throw error;
      }
    }

    throw new CliError(
      'AUTH_TIMEOUT',
      'Timed out while waiting for device authorization',
    );
  }

  async logout(): Promise<void> {
    await this.sessionSupport.clearSession();
  }

  async status(): Promise<ProfileState> {
    return this.getProfile();
  }

  async authStatus(): Promise<{
    profile: string;
    environment: EnvironmentName;
    clientId?: string;
    redirectUri?: string;
    configuredScope?: string;
    sessionScope?: string;
    authenticated: boolean;
    expiresAt?: string;
    rateLimitRetryAfter?: string;
  }> {
    const profile = await this.getProfile();
    return {
      profile: profile.profile.name,
      environment: profile.profile.environment,
      clientId: profile.profile.clientId,
      redirectUri: profile.profile.redirectUri,
      configuredScope: profile.profile.scope,
      sessionScope: profile.session?.scope,
      authenticated: Boolean(profile.session?.accessToken),
      expiresAt: profile.session?.expiresAt,
      rateLimitRetryAfter: profile.rateLimit.retryAfter,
    };
  }

  async listAppliances(_forceRefresh = true) {
    const profile = await this.store.requireSession(
      this.profileName,
      this.environment,
    );
    this.requestPolicy.ensureNotRateLimited(profile);
    const appliances = await this.sessionSupport.executeApiCall(
      profile,
      (client) => client.listAppliances(),
    );
    await this.store.mutateProfile(
      this.profileName,
      this.environment,
      (draft) => upsertAppliances(draft, appliances),
    );
    return appliances;
  }

  async getAppliance(applianceId: string) {
    const resolvedApplianceId =
      await this.resolveApplianceSelector(applianceId);
    const current = await this.store.requireSession(
      this.profileName,
      this.environment,
    );
    return this.guard.requireKnownAppliance(current, resolvedApplianceId)
      .appliance;
  }

  async listStatus(applianceId: string): Promise<ApiItem[]> {
    const profile = await this.refreshApplianceReadiness(applianceId);
    const items = await this.sessionSupport.executeApiCall(profile, (client) =>
      client.listStatus(applianceId),
    );
    await this.store.mutateProfile(
      this.profileName,
      this.environment,
      (draft) => storeStatuses(draft, applianceId, items),
    );
    return items;
  }

  async listAllStatuses(): Promise<ApplianceStatusSnapshot[]> {
    return this.collectConnectedApplianceSnapshots((appliance) =>
      this.listStatus(appliance.id).then((items) => ({
        applianceId: appliance.id,
        applianceName: appliance.name,
        items,
      })),
    );
  }

  async listSettings(applianceId: string): Promise<ApiItem[]> {
    return this.settingsSupport.listSettings(applianceId);
  }

  async listAllSettings(): Promise<ApplianceSettingSnapshot[]> {
    return this.settingsSupport.listAllSettings();
  }

  async getSetting(applianceId: string, settingKey: string): Promise<ApiItem> {
    return this.settingsSupport.getSetting(applianceId, settingKey);
  }

  async setSettings(
    applianceId: string,
    rawSettings: string[],
  ): Promise<ApiItem[]> {
    return this.settingsSupport.setSettings(
      applianceId,
      rawSettings,
      parsePrimitive,
    );
  }

  async listPrograms(applianceId: string): Promise<ProgramDefinition[]> {
    return this.programSupport.listPrograms(applianceId);
  }

  async listAllPrograms(): Promise<ApplianceProgramSnapshot[]> {
    return this.programSupport.listAllPrograms();
  }

  async getProgram(
    applianceId: string,
    programKey: string,
  ): Promise<ProgramDefinition> {
    return this.programSupport.getProgram(applianceId, programKey);
  }

  async getSelectedProgram(applianceId: string): Promise<ProgramDefinition> {
    return this.programSupport.getSelectedProgram(applianceId);
  }

  async setSelectedProgram(
    applianceId: string,
    programKey: string | undefined,
    rawOptions: string[],
  ): Promise<void> {
    await this.programSupport.setSelectedProgram(
      applianceId,
      programKey,
      rawOptions,
    );
  }

  async getActiveProgram(applianceId: string): Promise<ProgramDefinition> {
    return this.programSupport.getActiveProgram(applianceId);
  }

  async setActiveProgram(
    applianceId: string,
    programKey: string | undefined,
    rawOptions: string[],
  ): Promise<void> {
    await this.programSupport.setActiveProgram(
      applianceId,
      programKey,
      rawOptions,
    );
  }

  async getInteractiveProgramView(
    applianceId: string,
    mode: ProgramInteractionMode,
    programKey?: string,
  ): Promise<ProgramDefinition> {
    return this.programSupport.getInteractiveProgramView(
      applianceId,
      mode,
      programKey,
    );
  }

  async startProgram(
    applianceId: string,
    programKey?: string,
    rawOptions: string[] = [],
  ): Promise<void> {
    await this.programSupport.startProgram(applianceId, programKey, rawOptions);
  }

  async stopProgram(applianceId: string): Promise<void> {
    await this.programSupport.stopProgram(applianceId);
  }

  async watchEvents(
    applianceId: string,
    onEvent: (event: EventMessage) => Promise<void> | void,
  ): Promise<void> {
    await this.programSupport.watchEvents(applianceId, onEvent);
  }

  async completionSuggestions(tokens: string[]): Promise<string[]> {
    const profile =
      (await this.sessionSupport.peekProfile()) ??
      createEmptyProfileState(this.profileName, this.environment);
    return buildCompletionSuggestions({
      profile,
      tokens,
      ensureProgramsLoadedForCompletion: (activeProfile, normalizedTokens) =>
        this.programSupport.ensureProgramsLoadedForCompletion(
          activeProfile,
          normalizedTokens,
        ),
      ensureProgramDetailLoadedForCompletion: (
        activeProfile,
        normalizedTokens,
      ) =>
        this.programSupport.ensureProgramDetailLoadedForCompletion(
          activeProfile,
          normalizedTokens,
        ),
      ensureSettingsLoadedForCompletion: (activeProfile, normalizedTokens) =>
        this.settingsSupport.ensureSettingsLoadedForCompletion(
          activeProfile,
          normalizedTokens,
        ),
      resolveSettingForCompletion: (
        activeProfile,
        normalizedTokens,
        assignmentToken,
      ) =>
        this.settingsSupport.resolveSettingForCompletion(
          activeProfile,
          normalizedTokens,
          assignmentToken,
        ),
    });
  }

  async resolveApplianceSelector(selector: string): Promise<string> {
    const trimmedSelector = selector.trim();
    if (!trimmedSelector) {
      throw new CliError('APPLIANCE_REQUIRED', '--appliance is required');
    }

    let profile = await this.store.requireSession(
      this.profileName,
      this.environment,
    );
    this.requestPolicy.ensureNotRateLimited(profile);
    if (Object.keys(profile.appliances).length === 0) {
      await this.listAppliances(true);
      profile = await this.store.requireSession(
        this.profileName,
        this.environment,
      );
    }

    const resolvedApplianceId = resolveApplianceSelectorFromProfile(
      profile,
      trimmedSelector,
    );
    if (resolvedApplianceId) {
      return resolvedApplianceId;
    }

    throw new CliError(
      'APPLIANCE_UNKNOWN',
      `Appliance ${trimmedSelector} is not known locally`,
      { appliance: trimmedSelector },
    );
  }

  private async collectConnectedApplianceSnapshots<T>(
    loader: (appliance: ApplianceSummary) => Promise<T>,
  ): Promise<T[]> {
    const appliances = await this.listAppliances(true);
    const connectedAppliances = appliances.filter(
      (appliance) => appliance.connected,
    );
    return Promise.all(connectedAppliances.map(loader));
  }

  private async refreshApplianceReadiness(
    applianceId: string,
  ): Promise<ProfileState> {
    await this.listAppliances(true);
    const profile = await this.store.requireSession(
      this.profileName,
      this.environment,
    );
    this.requestPolicy.ensureNotRateLimited(profile);
    this.guard.requireConnected(profile, applianceId);
    return profile;
  }
}
