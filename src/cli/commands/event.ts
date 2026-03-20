import type { Command } from 'commander';
import { type RunAction, resolveAppliance, streamEvents } from '../runtime.js';

export function registerEventCommands(
  root: Command,
  runAction: RunAction,
): void {
  const event = root
    .command('event')
    .description('Event commands')
    .helpGroup('Home Connect commands:');

  event
    .command('tail')
    .option('--appliance <applianceId>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const applianceId = await resolveAppliance(
          options.appliance ?? context.appliance,
          context.interactive ?? false,
          service,
        );
        await streamEvents(service, context.output, applianceId, false);
        return { appliance: applianceId };
      });
    });
}
