import type { CliResult, OutputFormat } from '../types.js';
import { CliError } from './errors.js';
import { formatHuman } from './output/human.js';

export function printResult<T>(
  format: OutputFormat,
  result: CliResult<T>,
): void {
  if (format === 'json' || format === 'jsonl') {
    process.stdout.write(
      `${JSON.stringify(result, null, format === 'json' ? 2 : undefined)}\n`,
    );
    return;
  }

  if (!result.ok) {
    process.stderr.write(`${result.code}: ${result.message}\n`);
    if (result.details) {
      process.stderr.write(`${JSON.stringify(result.details, null, 2)}\n`);
    }
    return;
  }

  if (typeof result.data === 'string') {
    process.stdout.write(`${result.data}\n`);
    return;
  }

  process.stdout.write(`${formatHuman(result.data)}\n`);
}

export function fail(format: OutputFormat, error: unknown): never {
  const cliError =
    error instanceof CliError
      ? error
      : new CliError(
          'UNEXPECTED_ERROR',
          error instanceof Error ? error.message : 'Unexpected error',
        );
  printResult(format, {
    ok: false,
    code: cliError.code,
    message: cliError.message,
    details: cliError.details,
  });
  process.exitCode = 1;
  throw cliError;
}
