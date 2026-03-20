export const GLOBAL_COMPLETIONS = [
  'auth',
  'profile',
  'appliance',
  'status',
  'setting',
  'program',
  'event',
  '--appliance',
  '--profile',
  '--env',
  '--output',
  '--interactive',
];

export const SUBCOMMAND_COMPLETIONS: Record<string, string[]> = {
  auth: ['login', 'device-login', 'status', 'logout'],
  profile: ['get', 'set'],
  appliance: ['get'],
  status: ['get'],
  setting: ['get', 'set'],
  program: ['get', 'selected', 'active', 'start', 'stop'],
  'program:selected': ['get', 'set'],
  'program:active': ['get', 'set'],
  event: ['tail'],
  completion: ['generate'],
};

export const FLAG_COMPLETIONS: Record<string, string[]> = {
  'profile:set': ['--env', '--language', '--output'],
  'appliance:get': ['--appliance'],
  'status:get': ['--appliance'],
  'setting:get': ['--appliance', '--setting'],
  'setting:set': ['--appliance', '--setting'],
  'program:get': ['--appliance', '--program'],
  'program:selected:get': ['--appliance'],
  'program:selected:set': ['--appliance', '--program', '--option'],
  'program:active:get': ['--appliance'],
  'program:active:set': ['--appliance', '--program', '--option'],
  'program:start': ['--appliance', '--program', '--option'],
  'program:stop': ['--appliance'],
  'event:tail': ['--appliance'],
  'completion:generate': ['--shell'],
};

export const REPEATABLE_FLAG_COMPLETIONS: Record<string, string[]> = {
  'setting:set': ['--setting'],
  'program:selected:set': ['--option'],
  'program:active:set': ['--option'],
  'program:start': ['--option'],
};

export const ROOT_FLAG_VALUE_COMPLETIONS: Record<string, string[]> = {
  '--env': ['production', 'simulator'],
  '--output': ['human', 'json', 'jsonl'],
};
