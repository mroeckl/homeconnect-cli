import { CliError } from '../core/errors.js';
import type {
  CommandContext,
  EnvironmentName,
  OutputFormat,
} from '../types.js';

export interface GlobalOptions {
  profile?: string;
  output?: OutputFormat;
  env?: EnvironmentName;
  interactive?: boolean;
  appliance?: string;
  debug?: boolean;
  language?: string;
}

export function toCommandContext(
  options: GlobalOptions,
): CommandContext & { environment: EnvironmentName; appliance?: string } {
  return {
    profile: options.profile ?? 'production',
    output: options.output ?? 'human',
    interactive: options.interactive ?? false,
    environment: options.env ?? 'production',
    appliance: options.appliance,
    debug: options.debug ?? false,
    language: options.language,
  };
}

export function requireValue(
  value: string | undefined,
  code: string,
  message: string,
): string {
  if (!value) {
    throw new CliError(code, message);
  }
  return value;
}
