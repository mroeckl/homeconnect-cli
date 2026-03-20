import { Command } from 'commander';
import { registerApplianceCommands } from './commands/appliance.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerCompletionCommands } from './commands/completion.js';
import { registerEventCommands } from './commands/event.js';
import { registerProfileCommands } from './commands/profile.js';
import { registerProgramCommands } from './commands/program.js';
import { registerSettingCommands } from './commands/setting.js';
import { registerStatusCommands } from './commands/status.js';
import { createRunAction } from './runtime.js';

export function createRootCommand(): Command {
  const root = new Command();
  root
    .name('hc')
    .description('Home Connect CLI')
    .option('--appliance <applianceId>', 'Appliance selector')
    .option('--profile <profile>', 'Profile name', 'production')
    .option('--env <environment>', 'Environment')
    .option('--language <language>', 'Accept-Language override')
    .option('--output <format>', 'Output format')
    .option('--interactive', 'Interactive mode', false)
    .option('--debug', 'Include debugging details in errors', false);

  const runAction = createRunAction(root);
  registerAuthCommands(root, runAction);
  registerProfileCommands(root, runAction);
  registerApplianceCommands(root, runAction);
  registerStatusCommands(root, runAction);
  registerSettingCommands(root, runAction);
  registerProgramCommands(root, runAction);
  registerEventCommands(root, runAction);
  registerCompletionCommands(root, runAction);

  return root;
}
