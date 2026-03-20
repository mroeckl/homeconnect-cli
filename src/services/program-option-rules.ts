import type { ApiItem } from '../types.js';

export const PROGRAM_SELECTION_EXCLUDED_OPTION_KEYS: string[] = [
  'BSH.Common.Option.StartInRelative',
  'BSH.Common.Option.FinishInRelative',
] as const;

export function filterProgramSelectionOptions(items: ApiItem[]): ApiItem[] {
  return items.filter(
    (item) => !PROGRAM_SELECTION_EXCLUDED_OPTION_KEYS.includes(item.key),
  );
}
