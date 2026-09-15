import assert from 'node:assert';

import { minimatch } from 'minimatch';
import semver from 'semver';

const DEFAULT_BUMP = '^';
const ALIAS_PREFIX = 'npm:';

/** @type {Map<string, Set<string>>} */
const DEPS = new Map();

/**
 * @private for testing only
 *
 * @param {string} name
 * @param {string[]} list
 */
export function setDetectedDeps(name, list) {
  DEPS.set(name, new Set(list));
}

/**
 * @private for testing only
 *
 * Clears all detected dependency versions so tests don't leak the global
 * `DEPS` map into one another.
 */
export function resetDetectedDeps() {
  DEPS.clear();
}

/**
 *
 * @param {Record<string, string> | undefined} depSet
 * @param {import('./types.ts').ConfigForUpdate} config
 * @param {import('./types.ts').CatalogVersions} [catalogs] when provided, a
 *   dependency whose de-fragmented version exactly matches a catalog entry is
 *   swapped to that catalog's reference (`catalog:` / `catalog:<name>`) instead
 *   of being written as a plain version. Only pass this for `dependencies` and
 *   `devDependencies` -- npm/yarn/pnpm overrides can't use `catalog:`.
 */
export function updateManifestFor(depSet, config, catalogs) {
  if (depSet) {
    for (let [dep, currentVersion] of Object.entries(depSet)) {
      let newVersion = getVersionForConfig(dep, currentVersion, config);
      let ref = catalogs ? catalogRefFor(dep, newVersion, catalogs) : null;

      depSet[dep] = ref ?? newVersion;
    }
  }
}

/**
 * Decides whether a package.json dependency can be swapped to a pnpm catalog
 * reference. A swap is only made on an *exact match*: the dependency's
 * de-fragmented version must be identical to the catalog entry's de-fragmented
 * version, so adopting the catalog never widens or narrows what the package
 * accepts.
 *
 * When more than one catalog declares the dependency at that same version, the
 * catalog with the narrowest original range wins; ties fall back to the default
 * catalog, then declaration order.
 *
 * @param {string} dep
 * @param {string} finalVersion the dependency's de-fragmented version
 * @param {import('./types.ts').CatalogVersions} catalogs
 * @returns {string | null} the catalog reference to write, or null for no swap
 */
export function catalogRefFor(dep, finalVersion, catalogs) {
  // A dependency that is already a catalog reference (or any non-version) never
  // equals a real, de-fragmented catalog version, so it is left untouched.
  let entries = catalogs.get(dep);

  if (!entries) {
    return null;
  }

  let matches = entries.filter((entry) => entry.version === finalVersion);

  let [best] = matches.sort(compareCatalogNarrowness);

  return best?.ref ?? null;
}

/**
 * Orders matching catalog entries so the "best" one sorts first: narrowest
 * original range, then the default catalog, then earliest declaration order.
 *
 * @param {import('./types.ts').CatalogEntry} a
 * @param {import('./types.ts').CatalogEntry} b
 */
function compareCatalogNarrowness(a, b) {
  let aInB = safeSubset(a.range, b.range);
  let bInA = safeSubset(b.range, a.range);

  // The strictly-narrower range (a subset of the other, but not vice-versa)
  // fits the version most tightly.
  if (aInB && !bInA) return -1;
  if (bInA && !aInB) return 1;

  if (a.isDefault !== b.isDefault) {
    return a.isDefault ? -1 : 1;
  }

  return a.order - b.order;
}

/**
 * `semver.subset`, but tolerant of ranges it can't parse (treated as not a
 * subset) so an exotic catalog range can never throw here.
 *
 * @param {string} sub
 * @param {string} dom
 */
function safeSubset(sub, dom) {
  try {
    return semver.subset(sub, dom);
  } catch {
    return false;
  }
}

/**
 * Splits an npm alias into the real package it points at and the range it
 * requests:
 *
 * - `npm:typescript@7.1.0` -> `{ name: 'typescript', range: '7.1.0' }`
 * - `npm:@scope/pkg@^1.0.0` -> `{ name: '@scope/pkg', range: '^1.0.0' }`
 *
 * The key in package.json (e.g. `typescript-7`) is user-defined, and that key is
 * what de-fragmentation is keyed on -- the alias only tells us which real
 * package and version it resolves to.
 *
 * @param {string} version
 * @returns {{ name: string, range: string } | null} null when `version` is not
 *   an alias, or is an alias without a version (`npm:foo`), which is left alone
 *   like any other non-version.
 */
export function parseAlias(version) {
  if (!version.startsWith(ALIAS_PREFIX)) {
    return null;
  }

  let spec = version.slice(ALIAS_PREFIX.length);
  // Start at 1 so the leading `@` of a scoped package isn't mistaken for the
  // separator between the name and the range.
  let at = spec.indexOf('@', 1);

  if (at === -1) {
    return null;
  }

  let name = spec.slice(0, at);
  let range = spec.slice(at + 1);

  if (!name || !range) {
    return null;
  }

  return { name, range };
}

/**
 * Inverse of `parseAlias`
 *
 * @param {string} name the real package the alias points at
 * @param {string} range
 */
export function formatAlias(name, range) {
  return `${ALIAS_PREFIX}${name}@${range}`;
}

/**
 *
 * @param {string} dep
 * @param {string} currentVersion
 *  @param {import('./types.ts').ConfigForUpdate} config
 * @returns {string}
 */
export function getVersionForConfig(dep, currentVersion, config) {
  // npm:<real-package>@<range>
  //
  // De-fragment the range under the user-defined key, then put the alias back
  // so the dependency keeps pointing at the same real package.
  let alias = parseAlias(currentVersion);

  if (alias) {
    return formatAlias(
      alias.name,
      getVersionForConfig(dep, alias.range, config),
    );
  }

  let versions = DEPS.get(dep);

  if (!versions) {
    return currentVersion;
  }

  // github:owner/repo
  // github:owner/repo#sha
  //
  // this needs to happen before coerce, because if the owner/repo has a number in it
  // that number will be used as the version.
  if (isNonVersion(currentVersion)) {
    return currentVersion;
  }

  let plainCurrentVersion = clean(currentVersion);

  if (!plainCurrentVersion) {
    return toWrittenVersion(currentVersion, config);
  }

  let strategy = getBumpStrategy(dep, config);
  let version = getNearest(`${plainCurrentVersion}`, { versions, strategy });

  return toWrittenVersion(version, config);
}

/**
 * Obviously, not a version.
 *
 * @param {string} version
 */
function isNonVersion(version) {
  return (
    version === '*' ||
    version.startsWith('$') ||
    version.startsWith('workspace:') ||
    // pnpm catalog references: `catalog:` (default) or `catalog:<name>`
    // These point at a version declared in pnpm-workspace.yaml rather than
    // being a version themselves.
    version.startsWith('catalog:') ||
    // npm aliases *with* a version (`npm:typescript@7.1.0`) are unwrapped by
    // `parseAlias` before we get here. Anything still starting with `npm:` is
    // an alias without a version (`npm:foo`), which we can't do anything with.
    version.startsWith(ALIAS_PREFIX) ||
    version.startsWith('github:') ||
    version.includes('/') ||
    version.includes('://')
  );
}

/**
 *
 * @param {string} version
 */
export function clean(version) {
  let coerced = semver.coerce(version, { loose: true });

  if (!coerced) {
    return version;
  }

  let [, tail] = version.split(`${coerced}`);
  let rebuilt = `${coerced}${tail || ''}`;

  return rebuilt;
}

/**
 *
 * @param {string} version
 * @param {import('./types.ts').ConfigForUpdate} config
 * @returns {string}
 */
export function toWrittenVersion(version, config) {
  let alias = parseAlias(version);

  if (alias) {
    return formatAlias(alias.name, toWrittenVersion(alias.range, config));
  }

  if (isNonVersion(version)) {
    return version;
  }

  let writeAS = config['write-as'];
  let cleaned = clean(version);

  switch (writeAS) {
    case 'pinned':
      return `${cleaned}`;
    case 'patches':
      return `~${cleaned}`;
    case 'minors':
      return `^${cleaned}`;
    default:
      throw new Error(
        `Unknown 'write-as' config: ${writeAS}. Allowed: 'pinned', 'patches', and 'minors'`,
      );
  }
}

/**
 *
 * @param {string} current an already cleaned current version
 * @param {{ versions: Set<string>, strategy: '~' | `^` }} options
 * @returns {string} a cleaned version of the highest satisfying range
 */
export function getNearest(current, { versions, strategy }) {
  assert(
    clean(current) === current,
    `current version passed to getNearest must be cleaned (semver.clean)`,
  );

  let versionList = [...versions].map((version) => `${clean(version)}`);
  let currentRange = `${strategy}${current}`;
  let result = semver.maxSatisfying(versionList, currentRange);

  // result *could be* null
  return result || current;
}

/**
 *
 * @param {string} dep
 * @param {import('./types.ts').ConfigForUpdate} config
 * @returns {'^' | '~'}
 */
export function getBumpStrategy(dep, config) {
  for (let [range, list] of Object.entries(config['update-range'] || {})) {
    let isFound = list.some((match) => minimatch(dep, match));

    if (isFound) {
      // @ts-ignore
      return range;
    }
  }

  return DEFAULT_BUMP;
}

/**
 * @param {string} dep
 * @param {string} version
 */
function maybeAdd(dep, version) {
  // Aliases (`npm:typescript@7.1.0`) contribute their range under the
  // user-defined key, e.g. `typescript-7`, not under the real package name.
  let alias = parseAlias(version);

  if (alias) {
    version = alias.range;
  }

  // We can't do anything about "invalid versions", so we'll ignore them.
  // These include:
  // - file/github/git/etc protocol
  // - workspaces
  // - pnpm catalog references
  // - npm aliases without a version
  // - https URLs
  if (isNonVersion(version)) {
    return;
  }

  if (!semver.coerce(version)) {
    return;
  }

  let versions = DEPS.get(dep);

  if (!versions) {
    versions = new Set();
    DEPS.set(dep, versions);
  }

  versions.add(version);
}

/**
 * @param {import('./types.ts').Manifest} manifest
 */
export function injestDeps(manifest) {
  for (let [dep, version] of Object.entries(manifest.dependencies || {})) {
    maybeAdd(dep, version);
  }

  for (let [dep, version] of Object.entries(manifest.devDependencies || {})) {
    maybeAdd(dep, version);
  }
}

/**
 * Ingests the versions declared in a single pnpm catalog (either the default
 * `catalog` or one of the named `catalogs`) so they participate in
 * de-fragmentation alongside the versions found in each package.json.
 *
 * @param {Record<string, string> | undefined | null} catalog
 */
export function injestCatalog(catalog) {
  for (let [dep, version] of Object.entries(catalog || {})) {
    maybeAdd(dep, version);
  }
}
