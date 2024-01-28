import { normalizeConfig } from '../config.js';

import type { Config, UserConfig } from '../types.js';

export function c(userConfig: UserConfig = {}): Config {
  return normalizeConfig(userConfig);
}
