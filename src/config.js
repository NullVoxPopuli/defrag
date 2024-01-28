import path from 'node:path';

import { minimatch } from 'minimatch';

/**
 * @param {Partial<import('./types.ts').UserConfig>} [ userConfig ]
 * @return {import('./types.ts').Config}
 */
export function normalizeConfig(userConfig) {
  let config = userConfig || {};

  let topLevel = {
    'write-as': config['write-as'] || 'pinned',
  };

  /** @type {import('./types.ts').Config['overrides'] } */
  const overrides =
    config['overrides']?.map((override) => {
      const defaultRange = topLevel['write-as'];
      const pathsArray = Array.isArray(override.path)
        ? override.path
        : [override.path];

      return {
        devDependencies: override['devDependencies'] ?? defaultRange,
        dependencies: override['dependencies'] ?? defaultRange,
        path: pathsArray,
      };
    }) || [];

  return {
    ...topLevel,
    'update-range': {
      '~': [],
      '^': [],
      ...config['update-range'],
    },
    overrides,
  };
}

/**
 * @param {string} relativePath the workspace path
 * @param {import('./types.ts').Config} config
 */
export function getOverride(relativePath, config) {
  let { overrides } = config;

  let packageJsonPath = path.join(relativePath, 'package.json');

  let override = overrides.find((override) => {
    return override.path.some((match) => minimatch(packageJsonPath, match));
  });

  return override;
}
