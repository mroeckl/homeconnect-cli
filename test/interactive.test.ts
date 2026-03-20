import { describe, expect, it } from 'vitest';
import { assignmentValueChoices } from '../src/cli/interactive.js';

describe('interactive assignment values', () => {
  it('uses explicit allowed values when provided', () => {
    expect(
      assignmentValueChoices({
        key: 'Dishcare.Dishwasher.Option.HygienePlus',
        constraints: {
          allowedvalues: [true, false],
        },
      }),
    ).toEqual(['true', 'false']);
  });

  it('falls back to true/false for boolean items without allowed values', () => {
    expect(
      assignmentValueChoices({
        key: 'Dishcare.Dishwasher.Option.HygienePlus',
        type: 'Boolean',
      }),
    ).toEqual(['true', 'false']);
  });

  it('does not invent choices for non-boolean free-text items', () => {
    expect(
      assignmentValueChoices({
        key: 'BSH.Common.Option.ProgramProgress',
        type: 'String',
      }),
    ).toBeUndefined();
  });
});
