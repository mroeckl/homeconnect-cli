import {
  GLOBAL_COMPLETIONS,
  ROOT_FLAG_VALUE_COMPLETIONS,
} from './completion-config.js';

export interface CompletionState {
  normalizedTokens: string[];
  commandTokens: string[];
  lastToken: string;
  previousToken: string;
  applianceFlagIndex: number;
}

export function buildCompletionState(tokens: string[]): CompletionState {
  const normalizedTokens = tokens[0] === 'hc' ? tokens.slice(1) : [...tokens];
  return {
    normalizedTokens,
    commandTokens: extractCommandTokens(normalizedTokens),
    lastToken: normalizedTokens[normalizedTokens.length - 1] ?? '',
    previousToken: normalizedTokens[normalizedTokens.length - 2] ?? '',
    applianceFlagIndex: normalizedTokens.lastIndexOf('--appliance'),
  };
}

export function extractCommandTokens(normalizedTokens: string[]): string[] {
  return normalizedTokens.filter((token, index) => {
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
}

export function rootFlagValueCandidates(flag: string): string[] | undefined {
  return ROOT_FLAG_VALUE_COMPLETIONS[flag];
}

export function filterRepeatedSingularFlags(
  candidates: string[],
  normalizedTokens: string[],
  repeatableFlags: string[] = [],
): string[] {
  return candidates.filter((candidate) => {
    if (!candidate.startsWith('--')) {
      return true;
    }
    if (repeatableFlags.includes(candidate)) {
      return true;
    }
    return !normalizedTokens.includes(candidate);
  });
}

export function visibleGlobalCompletions(normalizedTokens: string[]): string[] {
  return filterRepeatedSingularFlags(GLOBAL_COMPLETIONS, normalizedTokens);
}
