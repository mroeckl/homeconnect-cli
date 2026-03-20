import type { AuthSession, ProfileConfig } from '../types.js';
import { HomeConnectClient } from './home-connect-client.js';

export type HomeConnectClientPort = Pick<
  HomeConnectClient,
  | 'getAuthorizationUrl'
  | 'exchangeAuthorizationCode'
  | 'requestDeviceCode'
  | 'pollDeviceToken'
  | 'refreshAccessToken'
  | 'listAppliances'
  | 'getAppliance'
  | 'listStatus'
  | 'listSettings'
  | 'getSetting'
  | 'setSetting'
  | 'listPrograms'
  | 'getProgram'
  | 'getSelectedProgram'
  | 'getActiveProgram'
  | 'selectProgram'
  | 'setSelectedOption'
  | 'setActiveProgram'
  | 'setActiveOption'
  | 'startProgram'
  | 'stopProgram'
  | 'streamEvents'
>;

export type ClientFactory = (
  profile: ProfileConfig,
  session: AuthSession | undefined,
  options: { debug: boolean; language?: string },
) => HomeConnectClientPort;

export function createDefaultClientFactory(): ClientFactory {
  return (profile, session, options) =>
    new HomeConnectClient({
      profile,
      accessToken: session?.accessToken,
      debug: options.debug,
      language: options.language,
    });
}
