import type { Command } from 'commander';
import type { HomeConnectService } from '../../services/home-connect-service.js';
import {
  pickAssignments,
  pickAssignmentValue,
  pickProgram,
  pickProgramOption,
} from '../interactive.js';
import { buildCommand, type RunAction, resolveAppliance } from '../runtime.js';

export function registerProgramCommands(
  root: Command,
  runAction: RunAction,
): void {
  const program = root
    .command('program')
    .description('Program commands')
    .helpGroup('Home Connect commands:');

  program
    .command('get')
    .option('--appliance <applianceId>')
    .option('--program <programKey>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const applianceSelector = options.appliance ?? context.appliance;
        if (applianceSelector && options.program) {
          const applianceId =
            await service.resolveApplianceSelector(applianceSelector);
          return service.getProgram(applianceId, options.program);
        }
        if (applianceSelector) {
          const applianceId =
            await service.resolveApplianceSelector(applianceSelector);
          return service.listPrograms(applianceId);
        }
        return service.listAllPrograms();
      });
    });

  const selected = program
    .command('selected')
    .description('Selected program commands');
  selected
    .command('get')
    .option('--appliance <applianceId>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const applianceId = await resolveAppliance(
          options.appliance ?? context.appliance,
          context.interactive ?? false,
          service,
        );
        return service.getSelectedProgram(applianceId);
      });
    });

  selected
    .command('set')
    .option('--appliance <applianceId>')
    .option('--program <programKey>')
    .option('--option <assignment...>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const applianceId = await resolveAppliance(
          options.appliance ?? context.appliance,
          context.interactive ?? false,
          service,
        );
        let programKey: string | undefined = options.program;
        let assignments: string[] = options.option ?? [];

        if (context.interactive && !programKey) {
          const programs = await service.listPrograms(applianceId);
          programKey = await pickProgram(programs);
        }
        if (context.interactive && programKey) {
          const configured = await configureProgramInteraction({
            applianceId,
            mode: 'selected',
            programKey,
            service,
          });
          assignments = configured.assignments;
          programKey = configured.programKey;
        }
        if (!context.interactive) {
          await service.setSelectedProgram(
            applianceId,
            programKey,
            assignments,
          );
        }
        return service.getSelectedProgram(applianceId);
      });
    });

  const active = program
    .command('active')
    .description('Active program commands');
  active
    .command('get')
    .option('--appliance <applianceId>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const applianceId = await resolveAppliance(
          options.appliance ?? context.appliance,
          context.interactive ?? false,
          service,
        );
        return service.getActiveProgram(applianceId);
      });
    });

  active
    .command('set')
    .option('--appliance <applianceId>')
    .option('--program <programKey>')
    .option('--option <assignment...>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const applianceId = await resolveAppliance(
          options.appliance ?? context.appliance,
          context.interactive ?? false,
          service,
        );
        let programKey: string | undefined = options.program;
        let assignments: string[] = options.option ?? [];
        if (context.interactive && !programKey) {
          const programs = await service.listPrograms(applianceId);
          programKey = await pickProgram(programs);
        }
        if (context.interactive && programKey) {
          const configured = await configureProgramInteraction({
            applianceId,
            mode: 'active',
            programKey,
            service,
          });
          assignments = configured.assignments;
          programKey = configured.programKey;
        } else {
          await service.setActiveProgram(applianceId, programKey, assignments);
        }
        return service.getActiveProgram(applianceId);
      });
    });

  program
    .command('start')
    .option('--appliance <applianceId>')
    .option('--program <programKey>')
    .option('--option <assignment...>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const applianceId = await resolveAppliance(
          options.appliance ?? context.appliance,
          context.interactive ?? false,
          service,
        );
        let programKey: string | undefined = options.program;
        let assignments: string[] = options.option ?? [];
        if (context.interactive && !programKey) {
          const programs = await service.listPrograms(applianceId);
          programKey = await pickProgram(programs);
        }
        if (context.interactive && programKey) {
          const details = await service.getProgram(applianceId, programKey);
          assignments = await pickAssignments('option', details.options ?? []);
        }

        await service.startProgram(applianceId, programKey, assignments);
        const staticParts = [`--appliance ${applianceId}`];
        if (programKey) {
          staticParts.push(`--program ${programKey}`);
        }
        return {
          appliance: applianceId,
          program: programKey,
          options: assignments,
          command: buildCommand(
            'hc program start',
            staticParts,
            assignments.map((item) => `--option ${item}`),
          ),
        };
      });
    });

  program
    .command('stop')
    .option('--appliance <applianceId>')
    .action(async (options) => {
      await runAction(async (service, context) => {
        const applianceId = await resolveAppliance(
          options.appliance ?? context.appliance,
          context.interactive ?? false,
          service,
        );
        await service.stopProgram(applianceId);
        return {
          appliance: applianceId,
          command: `hc program stop --appliance ${applianceId}`,
        };
      });
    });
}

export async function configureProgramInteraction({
  applianceId,
  mode,
  programKey,
  service,
}: {
  applianceId: string;
  mode: 'selected' | 'active';
  programKey: string;
  service: HomeConnectService;
}): Promise<{ programKey: string; assignments: string[] }> {
  let view = await service.getInteractiveProgramView(
    applianceId,
    mode,
    programKey,
  );
  const assignments: string[] = [];

  while (true) {
    const option = await pickProgramOption(view.options ?? []);
    if (!option) {
      break;
    }

    const value = await pickAssignmentValue(option);
    const assignment = `${option.key}=${value}`;
    if (mode === 'selected') {
      await service.setSelectedProgram(applianceId, undefined, [assignment]);
    } else {
      await service.setActiveProgram(applianceId, undefined, [assignment]);
    }
    assignments.push(assignment);
    view = await service.getInteractiveProgramView(applianceId, mode);
  }

  return { programKey: view.key, assignments };
}
