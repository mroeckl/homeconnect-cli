import type { ApiItem, ProfileState } from '../types.js';

export function resolveApplianceSelectorFromProfile(
  profile: ProfileState,
  selector: string,
): string | undefined {
  if (profile.appliances[selector]) {
    return selector;
  }

  const normalizedSelector = selector.toLowerCase();
  const exactNameMatches = Object.values(profile.appliances).filter(
    (appliance) =>
      appliance.appliance.name?.toLowerCase() === normalizedSelector,
  );

  if (exactNameMatches.length === 1) {
    return exactNameMatches[0].appliance.id;
  }

  return undefined;
}

export function applianceCompletionCandidates(profile: ProfileState): string[] {
  const candidates = new Set<string>();
  for (const appliance of Object.values(profile.appliances)) {
    candidates.add(appliance.appliance.id);
    if (appliance.appliance.name) {
      candidates.add(appliance.appliance.name);
    }
  }
  return [...candidates];
}

export function matchCompletions(
  candidates: string[],
  prefix: string,
): string[] {
  return candidates.filter((candidate) => candidate.startsWith(prefix));
}

export function matchFeatureCompletions(
  candidates: Pick<ApiItem, 'key' | 'name' | 'displayvalue'>[],
  query: string,
): string[] {
  if (!query) {
    return candidates.map((candidate) => candidate.key);
  }

  const exactPrefix = new Set<string>();
  const labelPrefix = new Set<string>();
  const segmentPrefix = new Set<string>();
  const segmentSubsequence = new Set<string>();
  const substring = new Set<string>();
  const normalizedQuery = query.toLowerCase();
  const querySegments = normalizedQuery.split('.');

  for (const candidate of candidates) {
    const key = candidate.key;
    const keyLower = key.toLowerCase();
    const labels = [candidate.name, candidate.displayvalue]
      .filter((label): label is string => Boolean(label))
      .map((label) => label.toLowerCase());
    const keySegments = keyLower.split('.');

    if (keyLower.startsWith(normalizedQuery)) {
      exactPrefix.add(key);
      continue;
    }

    if (labels.some((label) => label.startsWith(normalizedQuery))) {
      labelPrefix.add(key);
      continue;
    }

    if (keySegments.some((segment) => segment.startsWith(normalizedQuery))) {
      segmentPrefix.add(key);
      continue;
    }

    if (matchesSegmentSubsequence(keySegments, querySegments)) {
      segmentSubsequence.add(key);
      continue;
    }

    if (
      keyLower.includes(normalizedQuery) ||
      labels.some((label) => label.includes(normalizedQuery))
    ) {
      substring.add(key);
    }
  }

  return [
    ...exactPrefix,
    ...labelPrefix,
    ...segmentPrefix,
    ...segmentSubsequence,
    ...substring,
  ];
}

export function resolveFeatureSelector<
  T extends Pick<ApiItem, 'key' | 'name' | 'displayvalue'>,
>(candidates: T[], selector: string): T | undefined {
  const exactKeyMatch = candidates.find(
    (candidate) => candidate.key === selector,
  );
  if (exactKeyMatch) {
    return exactKeyMatch;
  }

  const matches = matchFeatureCompletions(candidates, selector);
  if (matches.length !== 1) {
    return undefined;
  }

  return candidates.find((candidate) => candidate.key === matches[0]);
}

export function matchAllowedValueCompletions(
  candidates: Array<{ insertValue: string; matchValue: string }>,
  query: string,
): Array<{ insertValue: string; matchValue: string }> {
  if (!query) {
    return candidates;
  }

  const normalizedQuery = query.toLowerCase();
  const prefixMatches = candidates.filter(
    (candidate) =>
      candidate.insertValue.toLowerCase().startsWith(normalizedQuery) ||
      candidate.matchValue.toLowerCase().startsWith(normalizedQuery),
  );
  const substringMatches = candidates.filter(
    (candidate) =>
      !prefixMatches.includes(candidate) &&
      (candidate.insertValue.toLowerCase().includes(normalizedQuery) ||
        candidate.matchValue.toLowerCase().includes(normalizedQuery)),
  );
  return [...prefixMatches, ...substringMatches];
}

export function toAllowedValueCompletion(value: unknown): {
  insertValue: string;
  matchValue: string;
} {
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const rawValue =
      'value' in record ? String(record.value) : JSON.stringify(record);
    const matchValue =
      typeof record.displayvalue === 'string' && record.displayvalue
        ? record.displayvalue
        : typeof record.name === 'string' && record.name
          ? record.name
          : humanizeCompletionValue(rawValue);
    return {
      insertValue: rawValue,
      matchValue,
    };
  }

  const rawValue = String(value);
  return {
    insertValue: rawValue,
    matchValue: humanizeCompletionValue(rawValue),
  };
}

function humanizeCompletionValue(value: string): string {
  if (!value.includes('.')) {
    return value;
  }
  const lastSegment = value.split('.').pop() ?? value;
  return lastSegment.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function matchesSegmentSubsequence(
  keySegments: string[],
  querySegments: string[],
): boolean {
  if (querySegments.length === 0) {
    return false;
  }

  let keyIndex = 0;
  for (const querySegment of querySegments) {
    if (!querySegment) {
      continue;
    }

    let matched = false;
    while (keyIndex < keySegments.length) {
      if (keySegments[keyIndex].startsWith(querySegment)) {
        matched = true;
        keyIndex += 1;
        break;
      }
      keyIndex += 1;
    }

    if (!matched) {
      return false;
    }
  }

  return true;
}
