import { beforeEach, describe, expect, it, vi } from 'vitest';

import { configureProgramInteraction } from '../src/cli/commands/program.js';
import type { ApiItem, InteractiveProgramView } from '../src/types.js';

const { pickProgramOption, pickAssignmentValue } = vi.hoisted(() => ({
  pickProgramOption: vi.fn(),
  pickAssignmentValue: vi.fn(),
}));

vi.mock('../src/cli/interactive.js', () => ({
  pickProgramOption,
  pickAssignmentValue,
}));

function takeNextView(views: InteractiveProgramView[]): InteractiveProgramView {
  const view = views.shift();
  if (!view) {
    throw new Error('No interactive view available');
  }
  return view;
}

describe('interactive program command flow', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('updates selected-program options via option-only writes', async () => {
    const option: ApiItem = { key: 'Dishcare.Option.ExtraDry' };
    const views: InteractiveProgramView[] = [
      { key: 'Dishcare.Program.Eco50', options: [option] },
      { key: 'Dishcare.Program.Eco50', options: [option] },
    ];
    const getInteractiveProgramView = vi.fn(async () => takeNextView(views));
    const setSelectedProgram = vi.fn(async () => undefined);
    const setActiveProgram = vi.fn(async () => undefined);
    pickProgramOption
      .mockResolvedValueOnce(option)
      .mockResolvedValueOnce(undefined);
    pickAssignmentValue.mockResolvedValueOnce('true');

    const result = await configureProgramInteraction({
      applianceId: 'dishy-id',
      mode: 'selected',
      programKey: 'Dishcare.Program.Eco50',
      service: {
        getInteractiveProgramView,
        setSelectedProgram,
        setActiveProgram,
      } as never,
    });

    expect(result).toEqual({
      programKey: 'Dishcare.Program.Eco50',
      assignments: ['Dishcare.Option.ExtraDry=true'],
    });
    expect(setSelectedProgram).toHaveBeenCalledWith('dishy-id', undefined, [
      'Dishcare.Option.ExtraDry=true',
    ]);
    expect(setActiveProgram).not.toHaveBeenCalled();
  });

  it('updates active-program options via option-only writes', async () => {
    const option: ApiItem = { key: 'Cooking.Oven.Option.SetpointTemperature' };
    const views: InteractiveProgramView[] = [
      { key: 'Cooking.Oven.Program.HeatingMode.PreHeating', options: [option] },
      { key: 'Cooking.Oven.Program.HeatingMode.PreHeating', options: [option] },
    ];
    const getInteractiveProgramView = vi.fn(async () => takeNextView(views));
    const setSelectedProgram = vi.fn(async () => undefined);
    const setActiveProgram = vi.fn(async () => undefined);
    pickProgramOption
      .mockResolvedValueOnce(option)
      .mockResolvedValueOnce(undefined);
    pickAssignmentValue.mockResolvedValueOnce('180');

    const result = await configureProgramInteraction({
      applianceId: 'oven-id',
      mode: 'active',
      programKey: 'Cooking.Oven.Program.HeatingMode.PreHeating',
      service: {
        getInteractiveProgramView,
        setSelectedProgram,
        setActiveProgram,
      } as never,
    });

    expect(result).toEqual({
      programKey: 'Cooking.Oven.Program.HeatingMode.PreHeating',
      assignments: ['Cooking.Oven.Option.SetpointTemperature=180'],
    });
    expect(setActiveProgram).toHaveBeenCalledWith('oven-id', undefined, [
      'Cooking.Oven.Option.SetpointTemperature=180',
    ]);
    expect(setSelectedProgram).not.toHaveBeenCalled();
  });
});
