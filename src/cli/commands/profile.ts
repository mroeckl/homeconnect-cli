import type { Command } from 'commander';
import { CliError } from '../../core/errors.js';
import type { RunAction } from '../runtime.js';

export function registerProfileCommands(
  root: Command,
  runAction: RunAction,
): void {
  const profile = root
    .command('profile')
    .description('Profile commands')
    .helpGroup('Admin commands:');

  profile.command('get').action(async () => {
    await runAction(async (service) => {
      const state = await service.getProfile();
      return state.profile;
    });
  });

  profile
    .command('set')
    .option('--env <environment>')
    .option('--language <language>')
    .option('--output <format>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const requestedFlags = new Set(process.argv.slice(2));
        const wantsEnvironment = requestedFlags.has('--env');
        const wantsLanguage = requestedFlags.has('--language');
        const wantsOutput = requestedFlags.has('--output');
        const environment = options.env ?? context.environment;
        const language = options.language ?? context.language;
        const output = options.output ?? context.output;
        if (!wantsEnvironment && !wantsLanguage && !wantsOutput) {
          throw new CliError(
            'PROFILE_SETTING_REQUIRED',
            '--env, --language or --output is required',
          );
        }
        return (
          await service.configureProfile({
            ...(wantsEnvironment ? { environment } : {}),
            ...(wantsLanguage && language ? { language } : {}),
            ...(wantsOutput ? { output } : {}),
          })
        ).profile;
      });
    });
}
