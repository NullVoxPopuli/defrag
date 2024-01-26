// @ts-check
import { getPackages } from '@manypkg/get-packages';
import { cosmiconfig } from 'cosmiconfig';
import debug from 'debug';
import { packageJson, project } from 'ember-apply';

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
   * @type {import('./types.ts').Config}
   */
  const config = {
    'write-as': 'pinned',
    ...(configResult?.config || {}),
  };

  d(`Resolved config:`);
  d(config);

  let manifests = [
    projectResult.rootPackage?.packageJson,
    ...projectResult.packages.map((p) => p.packageJson),
  ].filter(Boolean);

  d(`Found ${manifests.length} packages`);
  manifests.forEach((p) => p && injestDeps(p));

  let paths = [
    projectResult.rootPackage?.dir,
    ...projectResult.packages.map((p) => p.dir),
  ].filter(Boolean);

  d(`Found ${paths.length} paths`);

  for (let projectPath of paths) {
    if (!projectPath) continue;

    d(`Updating ${projectPath.replace(root, '')}`);

    await packageJson.modify((manifest) => {
      updateManifestFor(manifest.devDependencies, config);
      updateManifestFor(manifest.dependencies, config);
      // npm
      updateManifestFor(manifest.overrides, config);
      // yarn
      updateManifestFor(manifest.resolutions, config);
      // pnpm
      updateManifestFor(manifest.pnpm?.overrides, config);
    }, projectPath);
  }
}
