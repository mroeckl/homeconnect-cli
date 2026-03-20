import type { Command } from 'commander';
import { extractAuthorizationCode } from '../../core/parse.js';
import { promptForText } from '../interactive.js';
import type { RunAction } from '../runtime.js';

export function registerAuthCommands(
  root: Command,
  runAction: RunAction,
): void {
  const auth = root
    .command('auth')
    .description('Authentication commands')
    .helpGroup('Admin commands:');

  auth
    .command('login')
    .option('--client-id <clientId>')
    .option('--client-secret <clientSecret>')
    .option('--redirect-uri <redirectUri>')
    .action(async (options) => {
      await runAction(async (service) => {
        const patch = {
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          redirectUri: options.redirectUri,
        };
        const authorizationUrl = await service.getAuthorizationUrl(patch);
        process.stdout.write(
          `Open this URL in your browser:\n${authorizationUrl}\n`,
        );
        const code = extractAuthorizationCode(
          await promptForText('Paste redirect URL or authorization code'),
        );
        const session = await service.exchangeAuthorizationCode(code, patch);
        return { authorizationUrl, session };
      });
    });

  auth
    .command('device-login')
    .option('--client-id <clientId>')
    .option('--client-secret <clientSecret>')
    .action(async (options) => {
      await runAction(async (service) => {
        const patch = {
          clientId: options.clientId,
          clientSecret: options.clientSecret,
        };
        const deviceCode = await service.requestDeviceCode(patch);
        process.stdout.write(
          `Visit ${deviceCode.verification_uri} and enter code ${deviceCode.user_code}\n`,
        );
        const session = await service.exchangeDeviceCode(
          deviceCode.device_code,
          patch,
        );
        return { deviceCode, session };
      });
    });

  auth.command('status').action(async () => {
    await runAction(async (service) => service.authStatus());
  });

  auth.command('logout').action(async () => {
    await runAction(async (service) => {
      await service.logout();
      return 'Logged out';
    });
  });
}
