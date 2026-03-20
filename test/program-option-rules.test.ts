import { describe, expect, it } from 'vitest';
import { filterProgramSelectionOptions } from '../src/services/program-option-rules.js';

describe('program option rules', () => {
  it('excludes selection-forbidden timing options while keeping other options', () => {
    const items = [
      { key: 'BSH.Common.Option.StartInRelative' },
      { key: 'BSH.Common.Option.FinishInRelative' },
      { key: 'Dishcare.Dishwasher.Option.ExtraDry' },
    ];

    expect(filterProgramSelectionOptions(items)).toEqual([
      { key: 'Dishcare.Dishwasher.Option.ExtraDry' },
    ]);
  });
});
