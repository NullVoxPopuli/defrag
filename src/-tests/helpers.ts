import type { Config } from '../types.js';

export function c(overrides: Partial<Config> = {}): Config {
  return {
    'write-as': 'pinned' as const,
    ...overrides,
    'update-range': {
      '~': [],
      '^': [],
      ...overrides['update-range'],
    },
  };
}
