import type { ApiItem, ProfileState, ProgramDefinition } from '../types.js';
import {
  FLAG_COMPLETIONS,
  REPEATABLE_FLAG_COMPLETIONS,
  SUBCOMMAND_COMPLETIONS,
} from './completion-config.js';
import {
  applianceCompletionCandidates,
  matchAllowedValueCompletions,
  matchCompletions,
  matchFeatureCompletions,
  resolveApplianceSelectorFromProfile as resolveApplianceSelector,
  resolveFeatureSelector,
  toAllowedValueCompletion,
} from './completion-matching.js';
import {
  buildCompletionState,
  filterRepeatedSingularFlags,
  rootFlagValueCandidates,
  visibleGlobalCompletions,
} from './completion-state.js';
import { filterProgramSelectionOptions } from './program-option-rules.js';

interface CompletionOptions {
  profile: ProfileState;
  tokens: string[];
  ensureProgramsLoadedForCompletion: (
    profile: ProfileState,
    normalizedTokens: string[],
  ) => Promise<ProfileState>;
  ensureProgramDetailLoadedForCompletion: (
    profile: ProfileState,
    normalizedTokens: string[],
  ) => Promise<ProfileState>;
  ensureSettingsLoadedForCompletion: (
    profile: ProfileState,
    normalizedTokens: string[],
  ) => Promise<ProfileState>;
  resolveSettingForCompletion: (
    profile: ProfileState,
    normalizedTokens: string[],
    assignmentToken: string,
  ) => Promise<ApiItem | undefined>;
}

export async function completionSuggestions({
  profile,
  tokens,
  ensureProgramsLoadedForCompletion,
  ensureProgramDetailLoadedForCompletion,
  ensureSettingsLoadedForCompletion,
  resolveSettingForCompletion,
}: CompletionOptions): Promise<string[]> {
  let activeProfile = profile;
  const {
    normalizedTokens,
    commandTokens,
    lastToken,
    previousToken,
    applianceFlagIndex,
  } = buildCompletionState(tokens);
  const globalCompletions = visibleGlobalCompletions(normalizedTokens);

  if (normalizedTokens.length === 0) {
    return globalCompletions;
  }

  if (normalizedTokens.length === 1 && !normalizedTokens[0].startsWith('--')) {
    if (SUBCOMMAND_COMPLETIONS[normalizedTokens[0]]) {
      return SUBCOMMAND_COMPLETIONS[normalizedTokens[0]];
    }
    return matchCompletions(globalCompletions, normalizedTokens[0]);
  }

  if (normalizedTokens.length === 1 && normalizedTokens[0].startsWith('--')) {
    return matchCompletions(globalCompletions, normalizedTokens[0]);
  }

  const rootFlagValueSuggestions = rootFlagValueCandidates(previousToken);
  if (rootFlagValueSuggestions && previousToken !== '--appliance') {
    const exactMatch = rootFlagValueSuggestions.includes(lastToken);
    if (!exactMatch) {
      return matchCompletions(rootFlagValueSuggestions, lastToken);
    }
  }

  const currentRootFlagValueSuggestions = rootFlagValueCandidates(lastToken);
  if (currentRootFlagValueSuggestions && lastToken !== '--appliance') {
    return currentRootFlagValueSuggestions;
  }

  if (normalizedTokens.includes('--appliance') && lastToken === '--appliance') {
    return applianceCompletionCandidates(profile);
  }

  const applianceCandidates = applianceCompletionCandidates(profile);

  if (
    applianceFlagIndex >= 0 &&
    previousToken === '--appliance' &&
    !applianceCandidates.includes(lastToken)
  ) {
    return matchCompletions(applianceCandidates, lastToken);
  }

  if (
    applianceFlagIndex >= 0 &&
    previousToken === '--appliance' &&
    applianceCandidates.includes(lastToken)
  ) {
    const hasCommandTokens = normalizedTokens.some(
      (token, index) =>
        !token.startsWith('--') &&
        !(index > 0 && normalizedTokens[index - 1]?.startsWith('--')),
    );

    if (!hasCommandTokens) {
      return globalCompletions;
    }
  }

  if (applianceFlagIndex >= 0 && lastToken === '--program') {
    activeProfile = await ensureProgramsLoadedForCompletion(
      activeProfile,
      normalizedTokens,
    );
    const applianceId = resolveApplianceSelector(
      activeProfile,
      normalizedTokens[applianceFlagIndex + 1],
    );
    if (applianceId) {
      const programs =
        activeProfile.appliances[applianceId]?.availablePrograms ?? [];
      return programs.map((program) => program.key);
    }
  }

  if (applianceFlagIndex >= 0 && previousToken === '--program') {
    activeProfile = await ensureProgramsLoadedForCompletion(
      activeProfile,
      normalizedTokens,
    );
    const applianceId = resolveApplianceSelector(
      activeProfile,
      normalizedTokens[applianceFlagIndex + 1],
    );
    if (applianceId) {
      const programs =
        activeProfile.appliances[applianceId]?.availablePrograms ?? [];
      const matchingPrograms = matchFeatureCompletions(
        programs.map((program) => ({
          key: program.key,
          name: program.name,
          displayvalue: program.displayvalue,
        })),
        lastToken,
      );
      const exactProgramMatch = programs.some(
        (program) => program.key === lastToken,
      );
      if (exactProgramMatch) {
        const commandTokens = normalizedTokens.filter((token, index) => {
          if (token.startsWith('--')) {
            return false;
          }
          if (
            index > 0 &&
            normalizedTokens[index - 1]?.startsWith('--') &&
            normalizedTokens[index - 1] !== '--program'
          ) {
            return false;
          }
          return true;
        });
        const nestedKey =
          commandTokens.length >= 2
            ? `${commandTokens[0]}:${commandTokens[1]}`
            : undefined;
        const flagKey =
          commandTokens.length >= 3 &&
          nestedKey &&
          FLAG_COMPLETIONS[`${nestedKey}:${commandTokens[2]}`]
            ? `${nestedKey}:${commandTokens[2]}`
            : nestedKey;
        if (flagKey) {
          return filterRepeatedSingularFlags(
            FLAG_COMPLETIONS[flagKey] ?? [],
            normalizedTokens,
            REPEATABLE_FLAG_COMPLETIONS[flagKey] ?? [],
          );
        }
      }
      return matchingPrograms;
    }
  }

  if (lastToken === '--option' && applianceFlagIndex >= 0) {
    activeProfile = await ensureProgramDetailLoadedForCompletion(
      activeProfile,
      normalizedTokens,
    );
    const program = resolveOptionProgram(activeProfile, normalizedTokens);
    return (program?.options ?? []).map((option) => option.key);
  }

  if (lastToken === '--setting' && applianceFlagIndex >= 0) {
    activeProfile = await ensureSettingsLoadedForCompletion(
      activeProfile,
      normalizedTokens,
    );
    const applianceId = resolveApplianceSelector(
      activeProfile,
      normalizedTokens[applianceFlagIndex + 1],
    );
    const settings = applianceId
      ? (activeProfile.appliances[applianceId]?.settings ?? [])
      : [];
    return settings.map((setting) => setting.key);
  }

  if (
    previousToken === '--option' &&
    !lastToken.includes('=') &&
    applianceFlagIndex >= 0
  ) {
    activeProfile = await ensureProgramDetailLoadedForCompletion(
      activeProfile,
      normalizedTokens,
    );
    const program = resolveOptionProgram(activeProfile, normalizedTokens);
    const options = isProgramSelectedSetCommand(commandTokens)
      ? filterProgramSelectionOptions(program?.options ?? [])
      : (program?.options ?? []);
    const exactOption = resolveFeatureSelector(options, lastToken);
    if (exactOption) {
      const allowedValues =
        exactOption.constraints?.allowedvalues?.map(toAllowedValueCompletion) ??
        [];
      if (allowedValues.length > 0) {
        return allowedValues.map(
          (value) => `${exactOption.key}=${value.insertValue}`,
        );
      }
      return [`${exactOption.key}=`];
    }
    return matchFeatureCompletions(options, lastToken);
  }

  if (
    previousToken === '--setting' &&
    !lastToken.includes('=') &&
    applianceFlagIndex >= 0
  ) {
    activeProfile = await ensureSettingsLoadedForCompletion(
      activeProfile,
      normalizedTokens,
    );
    const applianceId = resolveApplianceSelector(
      activeProfile,
      normalizedTokens[applianceFlagIndex + 1],
    );
    const settings = applianceId
      ? (activeProfile.appliances[applianceId]?.settings ?? [])
      : [];
    const exactSetting = resolveFeatureSelector(settings, lastToken);
    if (exactSetting) {
      const settingDetail = await resolveSettingForCompletion(
        activeProfile,
        normalizedTokens,
        `${exactSetting.key}=`,
      );
      const allowedValues =
        settingDetail?.constraints?.allowedvalues?.map(
          toAllowedValueCompletion,
        ) ?? [];
      if (allowedValues.length > 0) {
        return allowedValues.map(
          (value) => `${exactSetting.key}=${value.insertValue}`,
        );
      }
      return [`${exactSetting.key}=`];
    }
    return matchFeatureCompletions(settings, lastToken);
  }

  if (lastToken.includes('=') && applianceFlagIndex >= 0) {
    const settingDetail = await resolveSettingForCompletion(
      profile,
      normalizedTokens,
      lastToken,
    );
    if (settingDetail) {
      const [settingSelector, prefix] = lastToken.split('=', 2);
      const allowedValues =
        settingDetail.constraints?.allowedvalues?.map(
          toAllowedValueCompletion,
        ) ?? [];
      return matchAllowedValueCompletions(allowedValues, prefix).map(
        (value) => `${settingSelector}=${value.insertValue}`,
      );
    }
  }

  if (lastToken.includes('=') && applianceFlagIndex >= 0) {
    activeProfile = await ensureProgramDetailLoadedForCompletion(
      activeProfile,
      normalizedTokens,
    );
    const program = resolveOptionProgram(activeProfile, normalizedTokens);
    const [optionSelector, prefix] = lastToken.split('=', 2);
    const options = isProgramSelectedSetCommand(commandTokens)
      ? filterProgramSelectionOptions(program?.options ?? [])
      : (program?.options ?? []);
    const option = resolveFeatureSelector(options, optionSelector);
    const allowedValues =
      option?.constraints?.allowedvalues?.map(toAllowedValueCompletion) ?? [];
    return matchAllowedValueCompletions(allowedValues, prefix).map(
      (value) => `${option?.key}=${value.insertValue}`,
    );
  }

  if (commandTokens.length === 0 && lastToken.startsWith('--')) {
    return matchCompletions(globalCompletions, lastToken);
  }

  if (commandTokens.length === 1) {
    if (SUBCOMMAND_COMPLETIONS[commandTokens[0]]) {
      return SUBCOMMAND_COMPLETIONS[commandTokens[0]];
    }
    return matchCompletions(globalCompletions, commandTokens[0]).filter(
      (candidate) => !candidate.startsWith('--'),
    );
  }

  if (commandTokens.length >= 2) {
    const nestedKey = `${commandTokens[0]}:${commandTokens[1]}`;
    const flagSuggestionsForNestedKey = filterRepeatedSingularFlags(
      FLAG_COMPLETIONS[nestedKey] ?? [],
      normalizedTokens,
      REPEATABLE_FLAG_COMPLETIONS[nestedKey] ?? [],
    );
    if (commandTokens.length === 2 && lastToken.startsWith('--')) {
      return matchCompletions(flagSuggestionsForNestedKey, lastToken);
    }
    if (commandTokens.length === 2 && SUBCOMMAND_COMPLETIONS[nestedKey]) {
      return SUBCOMMAND_COMPLETIONS[nestedKey];
    }
    if (
      commandTokens.length === 2 &&
      FLAG_COMPLETIONS[nestedKey] &&
      commandTokens[1] === lastToken
    ) {
      return flagSuggestionsForNestedKey;
    }
    if (
      commandTokens.length === 2 &&
      normalizedTokens[normalizedTokens.length - 2]?.startsWith('--')
    ) {
      return flagSuggestionsForNestedKey;
    }
    if (
      commandTokens.length === 2 &&
      SUBCOMMAND_COMPLETIONS[commandTokens[0]]
    ) {
      return matchCompletions(
        SUBCOMMAND_COMPLETIONS[commandTokens[0]],
        commandTokens[1],
      );
    }

    if (
      commandTokens.length === 3 &&
      FLAG_COMPLETIONS[`${nestedKey}:${commandTokens[2]}`] &&
      commandTokens[2] === lastToken
    ) {
      return filterRepeatedSingularFlags(
        FLAG_COMPLETIONS[`${nestedKey}:${commandTokens[2]}`] ?? [],
        normalizedTokens,
        REPEATABLE_FLAG_COMPLETIONS[`${nestedKey}:${commandTokens[2]}`] ?? [],
      );
    }

    if (
      commandTokens.length === 3 &&
      SUBCOMMAND_COMPLETIONS[nestedKey] &&
      FLAG_COMPLETIONS[`${nestedKey}:${commandTokens[2]}`]
    ) {
      return filterRepeatedSingularFlags(
        FLAG_COMPLETIONS[`${nestedKey}:${commandTokens[2]}`] ?? [],
        normalizedTokens,
        REPEATABLE_FLAG_COMPLETIONS[`${nestedKey}:${commandTokens[2]}`] ?? [],
      );
    }

    if (commandTokens.length === 3 && SUBCOMMAND_COMPLETIONS[nestedKey]) {
      return matchCompletions(
        SUBCOMMAND_COMPLETIONS[nestedKey],
        commandTokens[2],
      );
    }

    const key =
      commandTokens.length >= 3 &&
      FLAG_COMPLETIONS[`${nestedKey}:${commandTokens[2]}`]
        ? `${nestedKey}:${commandTokens[2]}`
        : nestedKey;
    const flagSuggestions = filterRepeatedSingularFlags(
      FLAG_COMPLETIONS[key] ?? [],
      normalizedTokens,
      REPEATABLE_FLAG_COMPLETIONS[key] ?? [],
    );
    if (lastToken.startsWith('--')) {
      return matchCompletions(flagSuggestions, lastToken);
    }
    if (
      normalizedTokens[normalizedTokens.length - 2] &&
      normalizedTokens[normalizedTokens.length - 2].startsWith('--')
    ) {
      return [];
    }
    return flagSuggestions;
  }

  return [];
}
export function resolveApplianceSelectorFromProfile(
  profile: ProfileState,
  selector: string,
): string | undefined {
  return resolveApplianceSelector(profile, selector);
}

function isProgramSelectedSetCommand(commandTokens: string[]): boolean {
  return (
    commandTokens.length >= 3 &&
    commandTokens[0] === 'program' &&
    commandTokens[1] === 'selected' &&
    commandTokens[2] === 'set'
  );
}

function resolveOptionProgram(
  profile: ProfileState,
  normalizedTokens: string[],
): ProgramDefinition | undefined {
  const applianceFlagIndex = normalizedTokens.lastIndexOf('--appliance');
  if (applianceFlagIndex < 0) {
    return undefined;
  }

  const applianceId = resolveApplianceSelector(
    profile,
    normalizedTokens[applianceFlagIndex + 1],
  );
  if (!applianceId) {
    return undefined;
  }

  const programFlagIndex = normalizedTokens.lastIndexOf('--program');
  if (programFlagIndex >= 0) {
    const programKey = normalizedTokens[programFlagIndex + 1];
    return profile.appliances[applianceId]?.programDetails?.[programKey];
  }

  const commandPath = normalizedTokens
    .filter((token, index) => {
      if (token.startsWith('--')) {
        return false;
      }
      if (index > 0 && normalizedTokens[index - 1]?.startsWith('--')) {
        return false;
      }
      return true;
    })
    .slice(0, 3)
    .join(':');

  if (commandPath === 'program:selected:set') {
    const selectedProgram = profile.appliances[applianceId]?.selectedProgram;
    if (!selectedProgram) {
      return undefined;
    }
    return (
      profile.appliances[applianceId]?.programDetails?.[selectedProgram.key] ??
      selectedProgram
    );
  }

  if (commandPath === 'program:active:set') {
    const activeProgram = profile.appliances[applianceId]?.activeProgram;
    if (!activeProgram) {
      return undefined;
    }
    return (
      profile.appliances[applianceId]?.programDetails?.[activeProgram.key] ??
      activeProgram
    );
  }

  return undefined;
}
