import type { Command } from 'commander';
import { pickAssignments } from '../interactive.js';
import { buildCommand, type RunAction, resolveAppliance } from '../runtime.js';

export function registerSettingCommands(
  root: Command,
  runAction: RunAction,
): void {
  const setting = root
    .command('setting')
    .description('Setting commands')
    .helpGroup('Home Connect commands:');

  setting
    .command('get')
    .option('--appliance <applianceId>')
    .option('--setting <settingKey>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const applianceSelector = options.appliance ?? context.appliance;
        if (applianceSelector) {
          const applianceId =
            await service.resolveApplianceSelector(applianceSelector);
          if (options.setting) {
            return service.getSetting(applianceId, options.setting);
          }
          return service.listSettings(applianceId);
        }
        return service.listAllSettings();
      });
    });

  setting
    .command('set')
    .option('--appliance <applianceId>')
    .option('--setting <assignment...>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const applianceId = await resolveAppliance(
          options.appliance ?? context.appliance,
          context.interactive ?? false,
          service,
        );
        let settings: string[] = options.setting ?? [];
        if (context.interactive) {
          const available = await service.listSettings(applianceId);
          settings = await pickAssignments('setting', available);
        }
        await service.setSettings(applianceId, settings);
        return {
          appliance: applianceId,
          settings,
          command: buildCommand(
            'hc setting set',
            [`--appliance ${applianceId}`],
            settings.map((item) => `--setting ${item}`),
          ),
        };
      });
    });
}
