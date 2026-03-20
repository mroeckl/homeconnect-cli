import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from '../core/errors.js';
import {
  DEFAULT_HOME_CONNECT_SCOPE,
  DEFAULT_REDIRECT_URI,
} from '../core/home-connect-defaults.js';
import type {
  EnvironmentName,
  ProfileConfig,
  ProfileState,
  RootState,
} from '../types.js';

const DEFAULT_STATE: RootState = { profiles: {} };
const LEGACY_SCOPE = 'IdentifyAppliance Monitor Settings';
const APP_DIRECTORY = 'homeconnect-api-cli';

export class StateStore {
  private readonly filePath: string;
  private readonly legacyFilePaths: string[];

  constructor(
    baseDir = defaultStateDirectory(),
    legacyBaseDir = process.cwd(),
  ) {
    this.filePath = join(baseDir, 'state.json');
    this.legacyFilePaths = [
      join(projectRootDirectory(), '.hc', 'state.json'),
      join(legacyBaseDir, '.hc', 'state.json'),
    ];
  }

  async load(): Promise<RootState> {
    try {
      await this.migrateLegacyStateIfNeeded();
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as RootState;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        const legacyState = await this.loadLegacyState();
        if (legacyState) {
          return legacyState;
        }
        return structuredClone(DEFAULT_STATE);
      }
      if (code === 'EPERM' || code === 'EACCES') {
        const legacyState = await this.loadLegacyState();
        if (legacyState) {
          return legacyState;
        }
        return structuredClone(DEFAULT_STATE);
      }
      if (error instanceof SyntaxError) {
        throw new CliError(
          'STATE_FILE_INVALID',
          `State file is invalid JSON: ${this.filePath}`,
          { path: this.filePath },
        );
      }
      throw error;
    }
  }

  async save(state: RootState): Promise<void> {
    const content = `${JSON.stringify(state, null, 2)}\n`;

    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      await writeFileAtomically(this.filePath, content);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EPERM' || code === 'EACCES') {
        const legacyFilePath =
          (await this.firstExistingLegacyFilePath()) ?? this.legacyFilePaths[0];
        await mkdir(dirname(legacyFilePath), { recursive: true });
        await writeFileAtomically(legacyFilePath, content);
        return;
      }
      throw error;
    }
  }

  async getProfile(
    name: string,
    environment: EnvironmentName = 'production',
  ): Promise<ProfileState> {
    const state = await this.load();
    if (!state.profiles[name]) {
      state.profiles[name] = createEmptyProfileState(name, environment);
      await this.save(state);
    } else {
      const migrated = migrateProfile(state.profiles[name]);
      if (migrated) {
        await this.save(state);
      }
    }
    return state.profiles[name];
  }

  async peekProfile(name: string): Promise<ProfileState | undefined> {
    const state = await this.load();
    const profile = state.profiles[name];
    if (!profile) {
      return undefined;
    }
    const snapshot = structuredClone(profile);
    migrateProfile(snapshot);
    return snapshot;
  }

  async mutateProfile(
    name: string,
    environment: EnvironmentName,
    mutator: (profile: ProfileState) => void,
  ): Promise<ProfileState> {
    const state = await this.load();
    if (!state.profiles[name]) {
      state.profiles[name] = createEmptyProfileState(name, environment);
    } else {
      migrateProfile(state.profiles[name]);
    }

    mutator(state.profiles[name]);
    await this.save(state);
    return state.profiles[name];
  }

  async updateProfileConfig(
    name: string,
    environment: EnvironmentName,
    patch: Partial<ProfileConfig>,
  ): Promise<ProfileState> {
    return this.mutateProfile(name, environment, (profile) => {
      profile.profile = {
        ...profile.profile,
        ...patch,
      };
    });
  }

  async clearSession(
    name: string,
    environment: EnvironmentName,
  ): Promise<void> {
    await this.mutateProfile(name, environment, (profile) => {
      delete profile.session;
    });
  }

  async requireSession(
    name: string,
    environment: EnvironmentName,
  ): Promise<ProfileState> {
    const profile = await this.getProfile(name, environment);
    if (!profile.session?.accessToken) {
      throw new CliError(
        'AUTH_REQUIRED',
        `Profile ${name} is not authenticated`,
        { profile: name },
      );
    }
    return profile;
  }

  private async migrateLegacyStateIfNeeded(): Promise<void> {
    if (await pathExists(this.filePath)) {
      return;
    }

    const legacyFilePath = await this.firstExistingLegacyFilePath();
    if (!legacyFilePath) {
      return;
    }

    await mkdir(dirname(this.filePath), { recursive: true });
    await copyFile(legacyFilePath, this.filePath);
  }

  private async loadLegacyState(): Promise<RootState | null> {
    for (const legacyFilePath of this.legacyFilePaths) {
      try {
        const raw = await readFile(legacyFilePath, 'utf8');
        return JSON.parse(raw) as RootState;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          continue;
        }
        throw error;
      }
    }

    return null;
  }

  private async firstExistingLegacyFilePath(): Promise<string | null> {
    for (const legacyFilePath of this.legacyFilePaths) {
      if (await pathExists(legacyFilePath)) {
        return legacyFilePath;
      }
    }

    return null;
  }
}

function migrateProfile(profile: ProfileState): boolean {
  let changed = false;

  if ('defaultOutput' in profile.profile && !profile.profile.output) {
    profile.profile.output = (
      profile.profile as ProfileState['profile'] & { defaultOutput?: string }
    ).defaultOutput as ProfileState['profile']['output'];
    delete (
      profile.profile as ProfileState['profile'] & { defaultOutput?: string }
    ).defaultOutput;
    changed = true;
  }

  if (!profile.profile.redirectUri) {
    profile.profile.redirectUri = DEFAULT_REDIRECT_URI;
    changed = true;
  }

  if (!profile.profile.scope || profile.profile.scope === LEGACY_SCOPE) {
    profile.profile.scope = DEFAULT_HOME_CONNECT_SCOPE;
    changed = true;
  }

  return changed;
}

export function createEmptyProfileState(
  name: string,
  environment: EnvironmentName,
): ProfileState {
  return {
    profile: {
      name,
      environment,
      redirectUri: DEFAULT_REDIRECT_URI,
      scope: DEFAULT_HOME_CONNECT_SCOPE,
    },
    appliances: {},
    rateLimit: {
      avoidableFailures: 0,
    },
  };
}

function defaultStateDirectory(): string {
  if (process.env.XDG_CONFIG_HOME) {
    return join(process.env.XDG_CONFIG_HOME, APP_DIRECTORY);
  }

  if (process.env.HOME) {
    return join(process.env.HOME, '.config', APP_DIRECTORY);
  }

  return join(process.cwd(), '.hc');
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function projectRootDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

async function writeFileAtomically(
  targetPath: string,
  content: string,
): Promise<void> {
  const temporaryPath = `${targetPath}.tmp`;
  await writeFile(temporaryPath, content, 'utf8');
  await rename(temporaryPath, targetPath);
}
