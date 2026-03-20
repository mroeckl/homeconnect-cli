import { CliError } from './errors.js';

export interface ParsedAssignment {
  key: string;
  value: string;
}

export function parseAssignment(
  input: string,
  label: 'option' | 'setting',
): ParsedAssignment {
  const index = input.indexOf('=');
  if (index <= 0) {
    throw new CliError(
      'INVALID_ASSIGNMENT',
      `Expected ${label} in key=value form, e.g. --${label} Feature.Key=value`,
      { input, label },
    );
  }

  return {
    key: input.slice(0, index),
    value: input.slice(index + 1),
  };
}

export function extractAuthorizationCode(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new CliError(
        'INVALID_AUTHORIZATION_CODE',
        'Expected a valid redirect URL or authorization code',
        { input: trimmed },
      );
    }

    const code = url.searchParams.get('code');
    if (!code) {
      throw new CliError(
        'INVALID_AUTHORIZATION_CODE',
        'Redirect URL does not contain a code parameter',
        { input: trimmed },
      );
    }
    return code;
  }

  if (!trimmed) {
    throw new CliError(
      'INVALID_AUTHORIZATION_CODE',
      'Authorization code must not be empty',
    );
  }

  return trimmed;
}
