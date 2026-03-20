import type { Command } from 'commander';
import type { RunAction } from '../runtime.js';

export function registerStatusCommands(
  root: Command,
  runAction: RunAction,
): void {
  const status = root
    .command('status')
    .description('Status commands')
    .helpGroup('Home Connect commands:');

  status
    .command('get')
    .option('--appliance <applianceId>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const applianceSelector = options.appliance ?? context.appliance;
        if (applianceSelector) {
          const applianceId =
            await service.resolveApplianceSelector(applianceSelector);
          return service.listStatus(applianceId);
        }
        return service.listAllStatuses();
      });
    });
}
