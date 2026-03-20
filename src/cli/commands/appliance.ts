import type { Command } from 'commander';
import type { RunAction } from '../runtime.js';

export function registerApplianceCommands(
  root: Command,
  runAction: RunAction,
): void {
  const appliance = root
    .command('appliance')
    .description('Appliance commands')
    .helpGroup('Home Connect commands:');

  appliance
    .command('get')
    .option('--appliance <applianceId>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const applianceSelector = options.appliance ?? context.appliance;
        if (applianceSelector) {
          const applianceId =
            await service.resolveApplianceSelector(applianceSelector);
          return service.getAppliance(applianceId);
        }
        return service.listAppliances();
      });
    });
}
