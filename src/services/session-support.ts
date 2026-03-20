import { CliError } from '../core/errors.js';
import type { StateStore } from '../storage/state-store.js';
import type {
  AuthSession,
  EnvironmentName,
  ProfileConfig,
  ProfileState,
  TokenResponse,
} from '../types.js';
import type { ClientFactory, HomeConnectClientPort } from './client-factory.js';
import type { RequestPolicy } from './request-policy.js';

const TOKEN_REFRESH_SKEW_MS = 60_000;

interface SessionSupportOptions {
  store: StateStore;
  profileName: string;
  environment: EnvironmentName;
  debug: boolean;
  language?: string;
  clientFactory: ClientFactory;
  requestPolicy: RequestPolicy;
}

export class SessionSupport {
  private readonly store: StateStore;
  private readonly profileName: string;
  private readonly environment: EnvironmentName;
  private readonly debug: boolean;
  private readonly language?: string;
  private readonly clientFactory: ClientFactory;
  private readonly requestPolicy: RequestPolicy;

  constructor(options: SessionSupportOptions) {
    this.store = options.store;
    this.profileName = options.profileName;
    this.environment = options.environment;
    this.debug = options.debug;
    this.language = options.language;
    this.clientFactory = options.clientFactory;
    this.requestPolicy = options.requestPolicy;
  }

  async getProfile(): Promise<ProfileState> {
    return this.store.getProfile(this.profileName, this.environment);
  }

  async peekProfile(): Promise<ProfileState | undefined> {
    return this.store.peekProfile(this.profileName);
  }

  async configureProfile(patch: Partial<ProfileConfig>): Promise<ProfileState> {
    return this.store.updateProfileConfig(
      this.profileName,
      this.environment,
      patch,
    );
  }

  async clearSession(): Promise<void> {
    await this.store.clearSession(this.profileName, this.environment);
  }

  async requireSession(): Promise<ProfileState> {
    return this.store.requireSession(this.profileName, this.environment);
  }

  async ensureProfileConfig(
    patch: Partial<ProfileConfig> | undefined,
  ): Promise<ProfileConfig> {
    const profileState = patch
      ? await this.configureProfile(patch)
      : await this.getProfile();
    const profile = profileState.profile;
    if (!profile.clientId) {
      throw new CliError(
        'CLIENT_CONFIG_REQUIRED',
        'clientId is required. Pass --client-id or set it in the profile.',
      );
    }
    return profile;
  }

  createClient(
    profile: ProfileConfig,
    session?: AuthSession,
  ): HomeConnectClientPort {
    return this.clientFactory(profile, session, {
      debug: this.debug,
      language: this.language,
    });
  }

  async persistToken(
    token: TokenResponse,
    existingSession?: AuthSession,
  ): Promise<AuthSession> {
    const session: AuthSession = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? existingSession?.refreshToken,
      tokenType: token.token_type,
      scope: token.scope ?? existingSession?.scope,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : undefined,
    };
    await this.store.mutateProfile(
      this.profileName,
      this.environment,
      (profile) => {
        profile.session = session;
      },
    );
    return session;
  }

  async executeApiCall<T>(
    profile: ProfileState,
    action: (client: HomeConnectClientPort) => Promise<T>,
  ): Promise<T> {
    let activeProfile = await this.ensureActiveSession(profile);
    try {
      return await action(
        this.createClient(activeProfile.profile, activeProfile.session),
      );
    } catch (error) {
      if (error instanceof CliError && error.code === 'AUTH_EXPIRED') {
        activeProfile = await this.refreshSession(activeProfile, true);
        return action(
          this.createClient(activeProfile.profile, activeProfile.session),
        );
      }
      if (error instanceof CliError && error.code === 'RATE_LIMITED') {
        this.requestPolicy.applyRateLimit(
          activeProfile,
          typeof error.details?.retryAfter === 'string'
            ? error.details.retryAfter
            : null,
        );
        await this.store.mutateProfile(
          this.profileName,
          this.environment,
          (draft) => {
            draft.rateLimit = activeProfile.rateLimit;
          },
        );
      }
      throw error;
    }
  }

  async authorizedClientForProfile(
    profile: ProfileState,
  ): Promise<HomeConnectClientPort> {
    const activeProfile = await this.ensureActiveSession(profile);
    return this.createClient(activeProfile.profile, activeProfile.session);
  }

  async ensureActiveSession(profile: ProfileState): Promise<ProfileState> {
    if (!profile.session?.accessToken) {
      throw new CliError(
        'AUTH_REQUIRED',
        `Profile ${this.profileName} is not authenticated`,
        { profile: this.profileName },
      );
    }

    if (!this.shouldRefreshSession(profile.session)) {
      return profile;
    }

    return this.refreshSession(profile, false);
  }

  private shouldRefreshSession(session: AuthSession): boolean {
    if (!session.expiresAt) {
      return false;
    }
    return (
      new Date(session.expiresAt).getTime() - Date.now() <=
      TOKEN_REFRESH_SKEW_MS
    );
  }

  private async refreshSession(
    profile: ProfileState,
    allowExpiredTokenFallback: boolean,
  ): Promise<ProfileState> {
    if (!profile.session?.refreshToken) {
      if (allowExpiredTokenFallback && profile.session?.accessToken) {
        return profile;
      }
      throw new CliError(
        'AUTH_REQUIRED',
        'Session is expired and no refresh token is available',
        {
          profile: this.profileName,
        },
      );
    }

    const token = await this.createClient(profile.profile).refreshAccessToken(
      profile.session.refreshToken,
    );
    await this.persistToken(token, profile.session);
    return this.store.requireSession(this.profileName, this.environment);
  }
}
