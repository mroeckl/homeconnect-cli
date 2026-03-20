import { CliError } from '../core/errors.js';
import { parseAssignment } from '../core/parse.js';
import type { StateStore } from '../storage/state-store.js';
import type {
  ApiItem,
  ApplianceProgramSnapshot,
  EnvironmentName,
  EventMessage,
  ProfileState,
  ProgramDefinition,
} from '../types.js';
import {
  storeActiveProgram,
  storeAvailablePrograms,
  storeProgramDetail,
  storeSelectedProgram,
  touchEvents,
} from './appliance-state.js';
import { resolveApplianceSelectorFromProfile } from './completion-matching.js';
import { extractCommandTokens } from './completion-state.js';
import type { GuardEngine } from './guard-engine.js';
import { filterProgramSelectionOptions } from './program-option-rules.js';
import type { SessionSupport } from './session-support.js';

export type ProgramInteractionMode = 'selected' | 'active';

interface ProgramSupportOptions {
  store: StateStore;
  sessionSupport: SessionSupport;
  guard: GuardEngine;
  profileName: string;
  environment: EnvironmentName;
  refreshApplianceReadiness: (applianceId: string) => Promise<ProfileState>;
  collectConnectedApplianceSnapshots: <T>(
    loader: (appliance: { id: string; name?: string }) => Promise<T>,
  ) => Promise<T[]>;
  assignmentsToItems: (
    assignments: Array<{ key: string; value: string }>,
  ) => ApiItem[];
}

export class ProgramSupport {
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
  private readonly assignmentsToItems: (
    assignments: Array<{ key: string; value: string }>,
  ) => ApiItem[];

  constructor(options: ProgramSupportOptions) {
    this.store = options.store;
    this.sessionSupport = options.sessionSupport;
    this.guard = options.guard;
    this.profileName = options.profileName;
    this.environment = options.environment;
    this.refreshApplianceReadiness = options.refreshApplianceReadiness;
    this.collectConnectedApplianceSnapshots =
      options.collectConnectedApplianceSnapshots;
    this.assignmentsToItems = options.assignmentsToItems;
  }

  async listPrograms(applianceId: string): Promise<ProgramDefinition[]> {
    const profile = await this.refreshApplianceReadiness(applianceId);
    const items = await this.sessionSupport.executeApiCall(profile, (client) =>
      client.listPrograms(applianceId),
    );
    await this.store.mutateProfile(
      this.profileName,
      this.environment,
      (draft) => storeAvailablePrograms(draft, applianceId, items),
    );
    return items;
  }

  async ensureProgramsLoadedForCompletion(
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

    const cachedPrograms =
      profile.appliances[applianceId]?.availablePrograms ?? [];
    if (cachedPrograms.length > 0) {
      return profile;
    }

    await this.listPrograms(applianceId);
    return this.store.requireSession(this.profileName, this.environment);
  }

  async ensureProgramDetailLoadedForCompletion(
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

    const programFlagIndex = normalizedTokens.lastIndexOf('--program');
    if (programFlagIndex >= 0) {
      const programKey = normalizedTokens[programFlagIndex + 1];
      if (!programKey || programKey.startsWith('--')) {
        return profile;
      }

      const cachedDetail =
        profile.appliances[applianceId]?.programDetails?.[programKey];
      if (cachedDetail) {
        return profile;
      }

      await this.getProgram(applianceId, programKey);
      return this.store.requireSession(this.profileName, this.environment);
    }

    const commandPath = extractCommandTokens(normalizedTokens)
      .slice(0, 3)
      .join(':');
    if (commandPath === 'program:selected:set') {
      const selectedProgram =
        profile.appliances[applianceId]?.selectedProgram ??
        (await this.getSelectedProgram(applianceId));
      const nextProfile = await this.store.requireSession(
        this.profileName,
        this.environment,
      );
      const cachedDetail =
        nextProfile.appliances[applianceId]?.programDetails?.[
          selectedProgram.key
        ];
      if (cachedDetail) {
        return nextProfile;
      }
      await this.getProgram(applianceId, selectedProgram.key);
      return this.store.requireSession(this.profileName, this.environment);
    }

    if (commandPath === 'program:active:set') {
      const activeProgram =
        profile.appliances[applianceId]?.activeProgram ??
        (await this.getActiveProgram(applianceId));
      const nextProfile = await this.store.requireSession(
        this.profileName,
        this.environment,
      );
      const cachedDetail =
        nextProfile.appliances[applianceId]?.programDetails?.[
          activeProgram.key
        ];
      if (cachedDetail) {
        return nextProfile;
      }
      await this.getProgram(applianceId, activeProgram.key);
      return this.store.requireSession(this.profileName, this.environment);
    }

    return profile;
  }

  async listAllPrograms(): Promise<ApplianceProgramSnapshot[]> {
    return this.collectConnectedApplianceSnapshots((appliance) =>
      this.listPrograms(appliance.id).then((items) => ({
        applianceId: appliance.id,
        applianceName: appliance.name,
        items,
      })),
    );
  }

  async getProgram(
    applianceId: string,
    programKey: string,
  ): Promise<ProgramDefinition> {
    await this.listPrograms(applianceId);
    const profile = await this.store.requireSession(
      this.profileName,
      this.environment,
    );
    this.guard.requireAvailableProgram(profile, applianceId, programKey);
    const program = await this.sessionSupport.executeApiCall(
      profile,
      (client) => client.getProgram(applianceId, programKey),
    );
    await this.store.mutateProfile(
      this.profileName,
      this.environment,
      (draft) => storeProgramDetail(draft, applianceId, programKey, program),
    );
    return program;
  }

  async getSelectedProgram(applianceId: string): Promise<ProgramDefinition> {
    const profile = await this.refreshApplianceReadiness(applianceId);
    const program = await this.sessionSupport.executeApiCall(
      profile,
      (client) => client.getSelectedProgram(applianceId),
    );
    await this.store.mutateProfile(
      this.profileName,
      this.environment,
      (draft) => storeSelectedProgram(draft, applianceId, program),
    );
    return program;
  }

  async setSelectedProgram(
    applianceId: string,
    programKey: string | undefined,
    rawOptions: string[],
  ): Promise<void> {
    if (!programKey && rawOptions.length === 0) {
      throw new CliError(
        'PROGRAM_REQUIRED',
        '--program or --option is required for hc program selected set',
      );
    }
    const profile = await this.refreshApplianceReadiness(applianceId);
    const program = programKey
      ? await this.getProgram(applianceId, programKey)
      : await this.getSelectedProgram(applianceId);
    const assignments = rawOptions.map((input) =>
      parseAssignment(input, 'option'),
    );
    this.guard.validateOptions(program, assignments);
    const options = this.assignmentsToItems(assignments);
    if (programKey) {
      await this.sessionSupport.executeApiCall(profile, (client) =>
        client.selectProgram(applianceId, program.key, options),
      );
    } else {
      for (const option of options) {
        await this.sessionSupport.executeApiCall(profile, (client) =>
          client.setSelectedOption(applianceId, option),
        );
      }
    }
    await this.store.mutateProfile(
      this.profileName,
      this.environment,
      (draft) =>
        storeSelectedProgram(draft, applianceId, {
          ...program,
          options: mergeProgramOptions(program.options ?? [], options),
        }),
    );
  }

  async getActiveProgram(applianceId: string): Promise<ProgramDefinition> {
    const profile = await this.refreshApplianceReadiness(applianceId);
    const program = await this.sessionSupport.executeApiCall(
      profile,
      (client) => client.getActiveProgram(applianceId),
    );
    await this.store.mutateProfile(
      this.profileName,
      this.environment,
      (draft) => storeActiveProgram(draft, applianceId, program),
    );
    return program;
  }

  async setActiveProgram(
    applianceId: string,
    programKey: string | undefined,
    rawOptions: string[],
  ): Promise<void> {
    if (!programKey && rawOptions.length === 0) {
      throw new CliError(
        'PROGRAM_REQUIRED',
        '--program or --option is required for hc program active set',
      );
    }
    const profile = await this.refreshApplianceReadiness(applianceId);
    const currentActiveProgram = programKey
      ? undefined
      : await this.getActiveProgram(applianceId);
    if (!programKey && !currentActiveProgram) {
      throw new CliError(
        'PROGRAM_REQUIRED',
        '--program or --option is required for hc program active set',
      );
    }
    let targetProgramKey = programKey;
    if (!targetProgramKey) {
      if (!currentActiveProgram) {
        throw new CliError(
          'PROGRAM_REQUIRED',
          '--program or --option is required for hc program active set',
        );
      }
      targetProgramKey = currentActiveProgram.key;
    }
    const program = await this.getProgram(applianceId, targetProgramKey);
    const assignments = rawOptions.map((input) =>
      parseAssignment(input, 'option'),
    );
    this.guard.validateOptions(program, assignments);
    const options = this.assignmentsToItems(assignments);
    if (programKey) {
      await this.sessionSupport.executeApiCall(profile, (client) =>
        client.setActiveProgram(applianceId, programKey, options),
      );
    } else {
      for (const option of options) {
        await this.sessionSupport.executeApiCall(profile, (client) =>
          client.setActiveOption(applianceId, option),
        );
      }
    }
    await this.store.mutateProfile(
      this.profileName,
      this.environment,
      (draft) =>
        storeActiveProgram(draft, applianceId, {
          ...program,
          key: programKey ?? program.key,
          options: mergeProgramOptions(program.options ?? [], options),
        }),
    );
  }

  async getInteractiveProgramView(
    applianceId: string,
    mode: ProgramInteractionMode,
    programKey?: string,
  ): Promise<ProgramDefinition> {
    if (programKey) {
      if (mode === 'selected') {
        await this.setSelectedProgram(applianceId, programKey, []);
      } else {
        await this.setActiveProgram(applianceId, programKey, []);
      }
    }

    const currentProgram =
      mode === 'selected'
        ? await this.getSelectedProgram(applianceId)
        : await this.getActiveProgram(applianceId);
    const availableProgram = await this.getProgram(
      applianceId,
      currentProgram.key,
    );
    const options = mergeInteractiveProgramOptions(
      currentProgram.options ?? [],
      availableProgram.options ?? [],
      mode,
    );

    return {
      ...currentProgram,
      name: currentProgram.name ?? availableProgram.name,
      displayvalue:
        currentProgram.displayvalue ?? availableProgram.displayvalue,
      options,
    };
  }

  async startProgram(
    applianceId: string,
    programKey: string | undefined,
    rawOptions: string[],
  ): Promise<void> {
    let effectiveProgramKey = programKey;
    let effectiveOptions: ApiItem[] = [];

    if (programKey) {
      await this.setSelectedProgram(applianceId, programKey, rawOptions);
      const profile = await this.refreshApplianceReadiness(applianceId);
      const detail = await this.getProgram(applianceId, programKey);
      const assignments = rawOptions.map((input) =>
        parseAssignment(input, 'option'),
      );
      this.guard.validateOptions(detail, assignments);
      effectiveOptions = this.assignmentsToItems(assignments);
      await this.sessionSupport.executeApiCall(profile, (client) =>
        client.startProgram(applianceId, programKey, effectiveOptions),
      );
      return;
    }

    const profile = await this.refreshApplianceReadiness(applianceId);
    const selectedProgram = await this.getSelectedProgram(applianceId);
    effectiveProgramKey = selectedProgram.key;
    const availableProgram = await this.getProgram(
      applianceId,
      effectiveProgramKey,
    );
    const assignments = rawOptions.map((input) =>
      parseAssignment(input, 'option'),
    );
    if (assignments.length > 0) {
      this.guard.validateOptions(availableProgram, assignments);
      effectiveOptions = mergeProgramOptions(
        filterWritableSelectedOptions(
          selectedProgram.options ?? [],
          availableProgram.options ?? [],
        ),
        this.assignmentsToItems(assignments),
      );
    } else {
      effectiveOptions = filterWritableSelectedOptions(
        selectedProgram.options ?? [],
        availableProgram.options ?? [],
      );
    }

    await this.sessionSupport.executeApiCall(profile, (client) =>
      client.startProgram(applianceId, effectiveProgramKey, effectiveOptions),
    );
  }

  async stopProgram(applianceId: string): Promise<void> {
    const profile = await this.refreshApplianceReadiness(applianceId);
    await this.sessionSupport.executeApiCall(profile, (client) =>
      client.stopProgram(applianceId),
    );
  }

  async watchEvents(
    applianceId: string,
    onEvent: (event: EventMessage) => Promise<void> | void,
  ): Promise<void> {
    const profile = await this.refreshApplianceReadiness(applianceId);
    const client =
      await this.sessionSupport.authorizedClientForProfile(profile);
    for await (const event of client.streamEvents(applianceId)) {
      await this.store.mutateProfile(
        this.profileName,
        this.environment,
        (draft) => touchEvents(draft, applianceId),
      );
      await onEvent(event);
    }
  }
}

function mergeProgramOptions(
  existing: ApiItem[],
  updates: ApiItem[],
): ApiItem[] {
  const merged = new Map(existing.map((item) => [item.key, item]));
  for (const update of updates) {
    merged.set(update.key, {
      ...merged.get(update.key),
      ...update,
    });
  }
  return [...merged.values()];
}

function mergeInteractiveProgramOptions(
  currentOptions: ApiItem[],
  availableOptions: ApiItem[],
  mode: ProgramInteractionMode,
): ApiItem[] {
  const writableOptions =
    mode === 'selected'
      ? filterProgramSelectionOptions(availableOptions)
      : availableOptions;

  return writableOptions.map((availableOption) => {
    const currentOption = currentOptions.find(
      (candidate) => candidate.key === availableOption.key,
    );
    return {
      ...availableOption,
      value: currentOption?.value ?? availableOption.value,
      displayvalue: currentOption?.displayvalue ?? availableOption.displayvalue,
      unit: currentOption?.unit ?? availableOption.unit,
      type: availableOption.type ?? currentOption?.type,
      name: availableOption.name ?? currentOption?.name,
    };
  });
}

function filterWritableSelectedOptions(
  selectedOptions: ApiItem[],
  writableOptions: ApiItem[],
): ApiItem[] {
  const writableKeys = new Set(writableOptions.map((option) => option.key));
  return selectedOptions.filter((option) => writableKeys.has(option.key));
}
