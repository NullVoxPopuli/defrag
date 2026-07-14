// @ts-check
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import debug from 'debug';
import { parseDocument } from 'yaml';

import { getVersionForConfig, injestCatalog } from './utils.js';

const d = debug('defrag');

const WORKSPACE_FILE = 'pnpm-workspace.yaml';

/**
 * pnpm catalogs are declared in pnpm-workspace.yaml:
 *
 * ```yaml
 * # the default (unnamed) catalog
 * catalog:
 *   react: ^18.2.0
 *
 * # named catalogs
 * catalogs:
 *   react17:
 *     react: ^17.0.2
 * ```
 *
 * Packages reference them with `catalog:` (default) or `catalog:<name>`.
 *
 * Reads and parses pnpm-workspace.yaml, preserving comments and formatting
 * so we can write it back out with minimal diffs.
 *
 * @param {string} root the monorepo root (where pnpm-workspace.yaml lives)
 * @returns {Promise<{ file: string, doc: import('yaml').Document } | null>}
 */
async function readWorkspace(root) {
  let file = path.join(root, WORKSPACE_FILE);

  if (!existsSync(file)) {
    return null;
  }

  let contents = await readFile(file, 'utf8');

  return { file, doc: parseDocument(contents) };
}

/**
 * @param {import('yaml').Document} doc
 * @returns {Record<string, Record<string, string>>} a mapping of
 *   catalog key-path (as a joined string, for debugging) to catalog map.
 *   The default catalog uses the key `catalog`; named catalogs use
 *   `catalogs.<name>`.
 */
function catalogsFromDoc(doc) {
  let json = doc.toJSON() || {};

  /** @type {Record<string, Record<string, string>>} */
  let result = {};

  if (json['catalog']) {
    result['catalog'] = json['catalog'];
  }

  let named = json['catalogs'] || {};

  for (let [name, catalog] of Object.entries(named)) {
    result[`catalogs.${name}`] = /** @type {Record<string, string>} */ (
      catalog
    );
  }

  return result;
}

/**
 * @param {string} label the catalog key-path (`catalog` or `catalogs.<name>`)
 * @returns {(string | number)[]} the path usable with `doc.setIn`
 */
function keyPathFor(label) {
  return label.split('.');
}

/**
 * Collects the versions declared in every pnpm catalog so they participate in
 * de-fragmentation alongside the versions found in each package.json.
 *
 * @param {string} root the monorepo root
 */
export async function injestCatalogs(root) {
  let workspace = await readWorkspace(root);

  if (!workspace) {
    return;
  }

  let catalogs = catalogsFromDoc(workspace.doc);

  for (let [label, catalog] of Object.entries(catalogs)) {
    d(`Ingesting pnpm ${label}`);
    injestCatalog(catalog);
  }
}

/**
 * Rewrites the versions declared in every pnpm catalog to the nearest in-range
 * version, using the same rules as npm `overrides`, yarn `resolutions`, and
 * `pnpm.overrides`. Catalogs are workspace-wide and only affect local
 * development, so they always use the top-level config.
 *
 * @param {string} root the monorepo root
 * @param {import('./types.ts').ConfigForUpdate} config
 */
export async function updateCatalogs(root, config) {
  let workspace = await readWorkspace(root);

  if (!workspace) {
    return;
  }

  let { file, doc } = workspace;
  let catalogs = catalogsFromDoc(doc);
  let changed = false;

  for (let [label, catalog] of Object.entries(catalogs)) {
    let keyPath = keyPathFor(label);

    for (let [dep, currentVersion] of Object.entries(catalog)) {
      let newVersion = getVersionForConfig(dep, currentVersion, config);

      if (newVersion !== currentVersion) {
        d(`Updating ${label} ${dep}: ${currentVersion} -> ${newVersion}`);
        doc.setIn([...keyPath, dep], newVersion);
        changed = true;
      }
    }
  }

  if (changed) {
    await writeFile(file, doc.toString());
  }
}
