import enquirer from 'enquirer';
import { CliError } from '../core/errors.js';
import type { ApiItem, ProgramDefinition } from '../types.js';

const { Confirm, Input, Select } = enquirer as unknown as {
  Confirm: new (
    options: Record<string, unknown>,
  ) => { run(): Promise<unknown> };
  Input: new (options: Record<string, unknown>) => { run(): Promise<unknown> };
  Select: new (options: Record<string, unknown>) => { run(): Promise<unknown> };
};

export async function promptForText(message: string): Promise<string> {
  const prompt = new Input({ name: 'value', message });
  return String(await prompt.run());
}

export async function pickAppliance(appliances: string[]): Promise<string> {
  if (appliances.length === 0) {
    throw new CliError(
      'APPLIANCE_UNKNOWN',
      'No appliances are available to select',
    );
  }
  if (appliances.length === 1) {
    return appliances[0];
  }
  const prompt = new Select({
    name: 'appliance',
    message: 'Select appliance',
    choices: appliances,
  });
  return String(await prompt.run());
}

export async function pickProgram(
  programs: ProgramDefinition[],
): Promise<string> {
  const prompt = new Select({
    name: 'program',
    message: 'Select program',
    choices: programs.map((program) => ({
      name: program.key,
      message: program.name ? `${program.name} (${program.key})` : program.key,
    })),
  });
  return String(await prompt.run());
}

export async function pickAssignments(
  kind: 'option' | 'setting',
  items: ApiItem[],
): Promise<string[]> {
  const assignments: string[] = [];
  for (const item of items) {
    const enabledPrompt = new Confirm({
      name: 'enabled',
      message: `Set ${kind} ${item.key}?`,
      initial: false,
    });
    const enabled = Boolean(await enabledPrompt.run());
    if (!enabled) {
      continue;
    }

    const value = await pickAssignmentValue(item);

    assignments.push(`${item.key}=${value}`);
  }
  return assignments;
}

export async function pickProgramOption(
  items: ApiItem[],
): Promise<ApiItem | undefined> {
  if (items.length === 0) {
    return undefined;
  }

  const prompt = new Select({
    name: 'option',
    message: 'Select option',
    choices: [
      {
        name: '__done__',
        message: 'Done',
      },
      ...items.map((item) => ({
        name: item.key,
        message: formatInteractiveOptionMessage(item),
      })),
    ],
  });

  const selected = String(await prompt.run());
  if (selected === '__done__') {
    return undefined;
  }

  return items.find((item) => item.key === selected);
}

export async function pickAssignmentValue(item: ApiItem): Promise<string> {
  const allowedValues = assignmentValueChoices(item);
  if (allowedValues && allowedValues.length > 0) {
    const choicePrompt = new Select({
      name: 'value',
      message: `Select value for ${item.key}`,
      choices: allowedValues.map((candidate) => ({
        name: String(candidate),
        message: String(candidate),
      })),
    });
    return String(await choicePrompt.run());
  }

  return promptForText(freeTextAssignmentMessage(item));
}

export function assignmentValueChoices(item: ApiItem): string[] | undefined {
  const allowedValues = item.constraints?.allowedvalues;
  if (allowedValues && allowedValues.length > 0) {
    return allowedValues.map((candidate) => String(candidate));
  }

  if (isBooleanItem(item)) {
    return ['true', 'false'];
  }

  return undefined;
}

function isBooleanItem(item: ApiItem): boolean {
  return (
    item.type?.toLowerCase() === 'boolean' ||
    typeof item.value === 'boolean' ||
    typeof item.constraints?.default === 'boolean'
  );
}

function formatInteractiveOptionMessage(item: ApiItem): string {
  const label = item.name ? `${item.name} (${item.key})` : item.key;
  const currentValue =
    item.displayvalue ??
    (item.value !== undefined ? String(item.value) : undefined);
  const constraint = describeConstraint(item);

  return [
    label,
    currentValue ? `current: ${currentValue}` : undefined,
    constraint,
  ]
    .filter(Boolean)
    .join(' | ');
}

function freeTextAssignmentMessage(item: ApiItem): string {
  const constraint = describeConstraint(item);
  return constraint
    ? `Value for ${item.key} (${constraint})`
    : `Value for ${item.key}`;
}

function describeConstraint(item: ApiItem): string | undefined {
  const constraints = item.constraints;
  if (!constraints) {
    return undefined;
  }

  if (constraints.allowedvalues && constraints.allowedvalues.length > 0) {
    return `allowed: ${constraints.allowedvalues.map(String).join(', ')}`;
  }

  const fragments: string[] = [];
  if (constraints.min !== undefined || constraints.max !== undefined) {
    const lower =
      constraints.min !== undefined ? String(constraints.min) : '-inf';
    const upper =
      constraints.max !== undefined ? String(constraints.max) : '+inf';
    fragments.push(`range: ${lower}-${upper}`);
  }
  if (constraints.stepsize !== undefined) {
    fragments.push(`step: ${constraints.stepsize}`);
  }
  return fragments.length > 0 ? fragments.join(', ') : undefined;
}
