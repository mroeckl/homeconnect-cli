import type { ApiItem } from '../../types.js';
import { stringifyValue } from './table.js';

export function formatOptionConstraints(option: ApiItem): string {
  if (option.constraints?.allowedvalues?.length) {
    return option.constraints.allowedvalues.map(renderAllowedValue).join(', ');
  }

  const range = formatRange(option);
  if (range) {
    return range;
  }

  return renderItemValue(option);
}

export function formatConstrainedItemValue(item: ApiItem): string {
  if (
    item.constraints?.allowedvalues?.length ||
    item.constraints?.min !== undefined ||
    item.constraints?.max !== undefined ||
    item.constraints?.stepsize !== undefined
  ) {
    return formatOptionConstraints(item);
  }

  return renderItemValue(item);
}

export function renderItemValue(item: ApiItem): string {
  if (item.displayvalue) {
    return item.displayvalue;
  }

  const value = renderAllowedValue(item.value);
  if (!value) {
    return '';
  }

  if (item.unit) {
    return `${value} ${item.unit}`;
  }

  return value;
}

export function renderAllowedValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.displayvalue === 'string' && record.displayvalue) {
      return record.displayvalue;
    }
    if (typeof record.name === 'string' && record.name) {
      return record.name;
    }
    if ('value' in record) {
      return renderAllowedValue(record.value);
    }
  }

  if (typeof value === 'string') {
    return humanizeEnumValue(value);
  }

  return stringifyValue(value);
}

function formatRange(option: ApiItem): string {
  const unit = normalizeUnit(option.unit);
  const suffix = unit ? ` ${unit}` : '';

  if (
    option.constraints?.min !== undefined &&
    option.constraints?.max !== undefined
  ) {
    const base = `${option.constraints.min}-${option.constraints.max}${suffix}`;
    if (option.constraints.stepsize !== undefined) {
      return `${base}, step ${option.constraints.stepsize}`;
    }
    return base;
  }

  if (option.constraints?.min !== undefined) {
    const base = `>= ${option.constraints.min}${suffix}`;
    if (option.constraints.stepsize !== undefined) {
      return `${base}, step ${option.constraints.stepsize}`;
    }
    return base;
  }

  if (option.constraints?.max !== undefined) {
    const base = `<= ${option.constraints.max}${suffix}`;
    if (option.constraints.stepsize !== undefined) {
      return `${base}, step ${option.constraints.stepsize}`;
    }
    return base;
  }

  return option.constraints?.stepsize !== undefined
    ? `step ${option.constraints.stepsize}`
    : '';
}

function humanizeEnumValue(value: string): string {
  if (!value.includes('.')) {
    return value;
  }

  const lastSegment = value.split('.').pop() ?? value;
  return lastSegment.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function normalizeUnit(unit: string | undefined): string {
  if (!unit) {
    return '';
  }

  if (unit === 's') {
    return 'seconds';
  }

  if (unit === 'min') {
    return 'minutes';
  }

  return unit;
}
