export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length)),
  );

  const headerLine = headers
    .map((header, index) => pad(header, widths[index]))
    .join('  ');
  const separatorLine = widths.map((width) => '-'.repeat(width)).join('  ');
  const rowLines = rows.map((row) =>
    row.map((cell, index) => pad(cell, widths[index])).join('  '),
  );

  return [headerLine, separatorLine, ...rowLines].join('\n');
}

export function formatKeyValue(rows: Array<[string, string]>): string {
  const width = Math.max(...rows.map(([key]) => key.length));
  return rows.map(([key, value]) => `${pad(key, width)}  ${value}`).join('\n');
}

export function pad(value: string, width: number): string {
  return value.padEnd(width, ' ');
}

export function stringifyValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}
