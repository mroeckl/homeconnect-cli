import type { Command } from 'commander';
import { completionScript } from '../completion-script.js';
import type { RunAction } from '../runtime.js';

export function registerCompletionCommands(
  root: Command,
  runAction: RunAction,
): void {
  const completion = root
    .command('completion', { hidden: true })
    .description('Shell completion');

  completion
    .command('generate')
    .option('--shell <shell>', 'Shell type', 'bash')
    .action(async (options) => {
      await runAction(async () => completionScript(options.shell));
    });
}
