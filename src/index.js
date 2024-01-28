// @ts-check
import { getPackages } from '@manypkg/get-packages';
import { cosmiconfig } from 'cosmiconfig';
import debug from 'debug';
import { packageJson, project } from 'ember-apply';

import { getOverride, normalizeConfig } from './config.js';
import { injestDeps, updateManifestFor } from './utils.js';

const d = debug('defrag');
const configExplorer = cosmiconfig('defrag');

/**
 * Two phase:
 *   - scan all dependencies for each workspace
 *   - apply in-range versions
 */
export default async function run() {
  const root = await project.workspaceRoot();
  const configResult = await configExplorer.search();
  const projectResult = await getPackages(root);

  /**
   * @type {import('./types.ts').UserConfig}
   */
  const userConfig = configResult?.config || {};
  const config = normalizeConfig(userConfig);

  d(`Resolved config:`);
  d(config);

  let packages = [projectResult.rootPackage, ...projectResult.packages].filter(
    Boolean,
  );

  d(`Found ${packages.length} packages`);
  packages.forEach((p) => p && injestDeps(p.packageJson));

  for (const pkg of packages) {
    if (!pkg) continue;

    d(`Updating ${pkg.relativeDir}`);

    await packageJson.modify((manifest) => {
      // These have configurable overrides in .defragrc.yml
      update(manifest, pkg.relativeDir, config, 'devDependencies');
      update(manifest, pkg.relativeDir, config, 'dependencies');

      // These don't have configurable overrides as they
      // *are* the overrides for the whole repo
      // (or in some cases a single workspace)
      // In any case, they only affect local development,
      // and not versions used by a consumer in a published package.
      //
      // npm
      updateManifestFor(manifest.overrides, config);
      // yarn
      updateManifestFor(manifest.resolutions, config);
      // pnpm
      updateManifestFor(manifest.pnpm?.overrides, config);
    }, pkg.dir);
  }
}

/**
 * @param {Record<string, any>} manifest
 * @param {string} relativePath
 * @param {import('./types.ts').Config} config
 * @param {'devDependencies' | 'dependencies'} collection
 */
function update(manifest, relativePath, config, collection) {
  let override = getOverride(relativePath, config);

  if (!override) {
    return updateManifestFor(manifest[collection], config);
  }

  let collectionConfig = override[collection];

  if (collectionConfig === false) {
    return;
  }

  let writeAs = collectionConfig ?? config['write-as'];

  updateManifestFor(manifest[collection], {
    'write-as': writeAs,
    'update-range': config['update-range'],
  });
}
