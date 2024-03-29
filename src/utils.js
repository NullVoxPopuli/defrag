import assert from 'node:assert';

import { minimatch } from 'minimatch';
import semver from 'semver';

const DEFAULT_BUMP = '^';

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
 *
 * @param {Record<string, string> | undefined} depSet
 * @param {import('./types.ts').ConfigForUpdate} config
 */
export function updateManifestFor(depSet, config) {
  if (depSet) {
    for (let [dep, currentVersion] of Object.entries(depSet)) {
      let newVersion = getVersionForConfig(dep, currentVersion, config);

      depSet[dep] = newVersion;
    }
  }
}

/**
 *
 * @param {string} dep
 * @param {string} currentVersion
 * @param {import('./types.ts').ConfigForUpdate} config
 */
export function getVersionForConfig(dep, currentVersion, config) {
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
 */
export function toWrittenVersion(version, config) {
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
 * @param {import('./types.ts').Manifest} manifest
 */
export function injestDeps(manifest) {
  /**
   * @param {string} dep
   * @param {string} version
   */
  function maybeAdd(dep, version) {
    // We can't do anything about "invalid versions", so we'll ignore them.
    // These include:
    // - file/github/git/etc protocol
    // - workspaces
    // - https URLs
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

  for (let [dep, version] of Object.entries(manifest.dependencies || {})) {
    maybeAdd(dep, version);
  }

  for (let [dep, version] of Object.entries(manifest.devDependencies || {})) {
    maybeAdd(dep, version);
  }
}
