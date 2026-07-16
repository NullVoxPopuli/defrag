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
 * @param {string} label the catalog key-path (`catalog` or `catalogs.<name>`)
 * @returns {string} the reference a package.json uses: `catalog:` (default) or
 *   `catalog:<name>` (named)
 */
function refFor(label) {
  if (label === 'catalog') {
    return 'catalog:';
  }

  return `catalog:${label.slice('catalogs.'.length)}`;
}

/**
 * Collects, for every dependency declared in any pnpm catalog, its
 * de-fragmented version alongside the reference a package.json would use to
 * point at it. This lets each package.json dependency be swapped to a
 * `catalog:` reference when its own de-fragmented version is an exact match.
 *
 * Returns an empty map when there is no pnpm-workspace.yaml (so callers can
 * treat "no catalogs" and "catalogs but no matches" identically).
 *
 * @param {string} root the monorepo root
 * @param {import('./types.ts').ConfigForUpdate} config the top-level config;
 *   catalogs are workspace-wide, so they never use per-package overrides
 * @returns {Promise<import('./types.ts').CatalogVersions>}
 */
export async function getCatalogVersions(root, config) {
  /** @type {import('./types.ts').CatalogVersions} */
  let result = new Map();

  let workspace = await readWorkspace(root);

  if (!workspace) {
    return result;
  }

  let catalogs = catalogsFromDoc(workspace.doc);
  let order = 0;

  for (let [label, catalog] of Object.entries(catalogs)) {
    let ref = refFor(label);
    let isDefault = label === 'catalog';

    for (let [dep, currentVersion] of Object.entries(catalog)) {
      let version = getVersionForConfig(dep, currentVersion, config);
      let entries = result.get(dep) || [];

      entries.push({
        ref,
        version,
        range: currentVersion,
        isDefault,
        order: order++,
      });
      result.set(dep, entries);
    }
  }

  return result;
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
