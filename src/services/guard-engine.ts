import { CliError } from '../core/errors.js';
import type { ParsedAssignment } from '../core/parse.js';
import { isFresh } from '../core/time.js';
import type { ApiItem, ProfileState, ProgramDefinition } from '../types.js';

const TTL_MS = {
  appliances: 30_000,
  status: 15_000,
  settings: 30_000,
  programs: 15_000,
};

function normalizeAllowedValues(
  item: ApiItem | undefined,
): string[] | undefined {
  const values = item?.constraints?.allowedvalues;
  if (!values || values.length === 0) {
    return undefined;
  }
  return values.map((value) => String(value));
}

export class GuardEngine {
  requireKnownAppliance(profile: ProfileState, applianceId: string) {
    const appliance = profile.appliances[applianceId];
    if (!appliance) {
      throw new CliError(
        'APPLIANCE_UNKNOWN',
        `Appliance ${applianceId} is not known locally`,
        { appliance: applianceId },
      );
    }
    return appliance;
  }

  requireConnected(profile: ProfileState, applianceId: string) {
    const appliance = this.requireKnownAppliance(profile, applianceId);
    if (!appliance.appliance.connected) {
      throw new CliError(
        'APPLIANCE_OFFLINE',
        `Appliance ${applianceId} is currently disconnected`,
        { appliance: applianceId },
      );
    }
    return appliance;
  }

  requireFreshCollection(
    profile: ProfileState,
    applianceId: string,
    resource: keyof typeof TTL_MS,
  ) {
    const appliance = this.requireKnownAppliance(profile, applianceId);
    if (!isFresh(appliance.freshness?.[resource], TTL_MS[resource])) {
      throw new CliError(
        'CACHE_STALE',
        `${resource} cache is stale for appliance ${applianceId}`,
        {
          appliance: applianceId,
          resource,
        },
      );
    }
    return appliance;
  }

  requireAvailableProgram(
    profile: ProfileState,
    applianceId: string,
    programKey: string,
  ): ProgramDefinition {
    const appliance = this.requireConnected(profile, applianceId);
    const programs = appliance.availablePrograms;
    if (!programs) {
      throw new CliError(
        'CACHE_STALE',
        'Available programs have not been loaded yet',
        { appliance: applianceId },
      );
    }

    const program = programs.find((candidate) => candidate.key === programKey);
    if (!program) {
      throw new CliError(
        'PROGRAM_UNAVAILABLE',
        `Program ${programKey} is not currently available`,
        {
          appliance: applianceId,
          program: programKey,
        },
      );
    }
    return program;
  }

  validateOptions(
    program: ProgramDefinition,
    assignments: ParsedAssignment[],
  ): void {
    const optionMap = new Map(
      (program.options ?? []).map((option) => [option.key, option]),
    );
    for (const assignment of assignments) {
      const option = optionMap.get(assignment.key);
      if (!option) {
        throw new CliError(
          'OPTION_INVALID',
          `Option ${assignment.key} is not currently valid for ${program.key}`,
          {
            option: assignment.key,
            program: program.key,
          },
        );
      }

      const allowedValues = normalizeAllowedValues(option);
      if (allowedValues && !allowedValues.includes(assignment.value)) {
        throw new CliError(
          'OPTION_INVALID',
          `Option ${assignment.key} does not allow value ${assignment.value}`,
          {
            option: assignment.key,
            allowedValues,
            actual: assignment.value,
          },
        );
      }

      if (
        option.constraints?.min !== undefined ||
        option.constraints?.max !== undefined
      ) {
        const numeric = Number(assignment.value);
        if (Number.isNaN(numeric)) {
          throw new CliError(
            'OPTION_INVALID',
            `Option ${assignment.key} expects a numeric value`,
            {
              option: assignment.key,
              actual: assignment.value,
            },
          );
        }
        if (
          option.constraints.min !== undefined &&
          numeric < option.constraints.min
        ) {
          throw new CliError(
            'OPTION_INVALID',
            `Option ${assignment.key} is below minimum`,
            {
              option: assignment.key,
              min: option.constraints.min,
              actual: numeric,
            },
          );
        }
        if (
          option.constraints.max !== undefined &&
          numeric > option.constraints.max
        ) {
          throw new CliError(
            'OPTION_INVALID',
            `Option ${assignment.key} is above maximum`,
            {
              option: assignment.key,
              max: option.constraints.max,
              actual: numeric,
            },
          );
        }
      }
    }
  }

  validateSettings(
    settings: ApiItem[] | undefined,
    assignments: ParsedAssignment[],
  ): void {
    const settingMap = new Map(
      (settings ?? []).map((setting) => [setting.key, setting]),
    );
    for (const assignment of assignments) {
      if (!settingMap.has(assignment.key)) {
        throw new CliError(
          'SETTING_INVALID',
          `Setting ${assignment.key} is not currently available`,
          {
            setting: assignment.key,
          },
        );
      }
    }
  }
}
