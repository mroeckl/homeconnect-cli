#!/usr/bin/env node
import { createRootCommand } from './cli/app.js';
import type { RootOptions } from './cli/runtime.js';
import { createService } from './cli/runtime.js';
import { printResult } from './core/output.js';
import type { OutputFormat } from './types.js';

export async function main(argv = process.argv): Promise<void> {
  if (argv[2] === '__complete') {
    const tokens = argv.slice(3);
    const service = await createService(completionRootOptions(tokens));
    try {
      const suggestions = await service.completionSuggestions(tokens);
      process.stdout.write(`${suggestions.join('\n')}\n`);
    } catch {
      process.exitCode = 1;
    }
    return;
  }

  if (countFlagOccurrences(argv.slice(2), '--appliance') > 1) {
    printResult(requestedOutput(argv.slice(2)), {
      ok: false,
      code: 'APPLIANCE_DUPLICATE',
      message: '--appliance may only be provided once',
    });
    process.exitCode = 1;
    return;
  }

  const root = createRootCommand();
  await root.parseAsync(argv);
}

function countFlagOccurrences(args: string[], flag: string): number {
  return args.filter((arg) => arg === flag).length;
}

function requestedOutput(args: string[]): OutputFormat {
  const outputFlagIndex = args.lastIndexOf('--output');
  if (outputFlagIndex >= 0) {
    const candidate = args[outputFlagIndex + 1];
    if (
      candidate === 'json' ||
      candidate === 'jsonl' ||
      candidate === 'human'
    ) {
      return candidate;
    }
  }

  return 'human';
}

function completionRootOptions(tokens: string[]): RootOptions {
  const options: RootOptions = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--profile') {
      const value = tokens[index + 1];
      if (value && !value.startsWith('--')) {
        options.profile = value;
      }
      continue;
    }

    if (token === '--env') {
      const value = tokens[index + 1];
      if (value === 'production' || value === 'simulator') {
        options.env = value;
      }
      continue;
    }

    if (token === '--language') {
      const value = tokens[index + 1];
      if (value && !value.startsWith('--')) {
        options.language = value;
      }
    }
  }

  return options;
}

void main();
