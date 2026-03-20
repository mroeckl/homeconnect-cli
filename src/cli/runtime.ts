import type { Command } from 'commander';
import { CliError } from '../core/errors.js';
import { printResult } from '../core/output.js';
import { HomeConnectService } from '../services/home-connect-service.js';
import { createEmptyProfileState, StateStore } from '../storage/state-store.js';
import type {
  EnvironmentName,
  EventMessage,
  OutputFormat,
  ProfileConfig,
} from '../types.js';
import { toCommandContext } from './helpers.js';
import { pickAppliance } from './interactive.js';

export interface RootOptions {
  profile?: string;
  output?: OutputFormat;
  env?: 'production' | 'simulator';
  interactive?: boolean;
  appliance?: string;
  debug?: boolean;
  language?: string;
}

export type CommandContext = ReturnType<typeof toCommandContext>;
export type RunAction = <T>(
  action: (service: HomeConnectService, context: CommandContext) => Promise<T>,
) => Promise<void>;

interface ResolvedRootContext extends CommandContext {
  environment: EnvironmentName;
}

interface ResolvedRuntime {
  store: StateStore;
  service: HomeConnectService;
  context: ResolvedRootContext;
}

export async function createService(
  options: RootOptions,
): Promise<HomeConnectService> {
  const runtime = await resolveRuntime(options, false);
  return runtime.service;
}

export function createRunAction(root: Command): RunAction {
  return async (action) => {
    const options = root.opts<RootOptions>();
    const { service, context } = await resolveRuntime(options, true);
    const profile = await service.getProfile();
    const effectiveContext = {
      ...context,
      output: options.output ?? profile.profile.output ?? ('human' as const),
    };

    try {
      const data = await action(service, effectiveContext);
      printResult(effectiveContext.output, { ok: true, data });
    } catch (error) {
      const cliError =
        error instanceof CliError
          ? error
          : new CliError(
              'UNEXPECTED_ERROR',
              error instanceof Error ? error.message : 'Unexpected error',
            );
      printResult(effectiveContext.output, {
        ok: false,
        code: cliError.code,
        message: cliError.message,
        details: cliError.details,
      });
      process.exitCode = 1;
    }
  };
}

export async function resolveAppliance(
  applianceId: string | undefined,
  interactive: boolean,
  service: HomeConnectService,
): Promise<string> {
  if (applianceId) {
    return service.resolveApplianceSelector(applianceId);
  }
  if (!interactive) {
    throw new CliError('APPLIANCE_REQUIRED', '--appliance is required');
  }
  const appliances = await service.listAppliances();
  return pickAppliance(appliances.map((item) => item.id));
}

export async function streamEvents(
  service: HomeConnectService,
  output: OutputFormat,
  applianceId: string,
  wrap: boolean,
): Promise<void> {
  await service.watchEvents(applianceId, (event: EventMessage) => {
    const shouldWrap = wrap || output === 'human';
    printResult(output, {
      ok: true,
      data: shouldWrap ? { appliance: applianceId, event } : event,
    });
  });
}

export function buildCommand(
  base: string,
  requiredParts: string[],
  assignmentParts: string[],
): string {
  return [base, ...requiredParts, ...assignmentParts].join(' ');
}

async function resolveRuntime(
  options: RootOptions,
  persistBootstrapDefaults: boolean,
): Promise<ResolvedRuntime> {
  const store = new StateStore();
  const profileName = options.profile ?? 'production';
  const environment = await resolveEnvironment(store, profileName, options.env);
  let profile = persistBootstrapDefaults
    ? await store.getProfile(profileName, environment)
    : ((await store.peekProfile(profileName)) ??
      createEmptyProfileState(profileName, environment));

  if (persistBootstrapDefaults) {
    const bootstrapPatch = buildBootstrapProfilePatch(profile.profile, options);
    if (bootstrapPatch) {
      profile = await store.updateProfileConfig(
        profileName,
        environment,
        bootstrapPatch,
      );
    }
  }

  const context = {
    ...toCommandContext({
      ...options,
      profile: profileName,
      env: environment,
      output: options.output ?? profile.profile.output ?? 'human',
      language: options.language ?? profile.profile.language,
    }),
    environment,
  };

  return {
    store,
    service: new HomeConnectService({
      store,
      profileName: context.profile,
      environment: context.environment,
      debug: context.debug,
      language: context.language,
    }),
    context,
  };
}

function buildBootstrapProfilePatch(
  profile: ProfileConfig,
  options: RootOptions,
): Partial<ProfileConfig> | undefined {
  const patch: Partial<ProfileConfig> = {};

  if (!profile.environment && options.env) {
    patch.environment = options.env;
  }

  if (!profile.language && options.language) {
    patch.language = options.language;
  }

  if (!profile.output && options.output) {
    patch.output = options.output;
  }

  return Object.keys(patch).length > 0 ? patch : undefined;
}

async function resolveEnvironment(
  store: StateStore,
  profileName: string,
  explicitEnvironment?: EnvironmentName,
): Promise<EnvironmentName> {
  if (explicitEnvironment) {
    return explicitEnvironment;
  }

  const state = await store.load();
  return state.profiles[profileName]?.profile.environment ?? 'production';
}
