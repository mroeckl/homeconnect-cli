import type { ParsedAssignment } from '../core/parse.js';
import type { ApiItem } from '../types.js';

export function assignmentsToItems(assignments: ParsedAssignment[]): ApiItem[] {
  return assignments.map((assignment) => ({
    key: assignment.key,
    value: parsePrimitive(assignment.value),
  }));
}

export function parsePrimitive(raw: string): string | number | boolean {
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }
  return raw;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
