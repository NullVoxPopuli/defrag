import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect as e, it } from 'vitest';
import { parse } from 'yaml';

import { c } from './-tests/helpers.ts';
import { injestCatalogs, updateCatalogs } from './pnpm-workspace.js';
import { injestDeps, resetDetectedDeps, setDetectedDeps } from './utils.js';

const expect = e.soft;

describe('pnpm catalogs', () => {
  let root: string;

  beforeEach(async () => {
    // The detected-versions map is module-global; reset it so each test is
    // hermetic and its assertions are unambiguous.
    resetDetectedDeps();
    root = await mkdtemp(path.join(tmpdir(), 'defrag-catalog-'));
  });

  async function writeWorkspace(lines: string[]) {
    await writeFile(
      path.join(root, 'pnpm-workspace.yaml'),
      lines.join('\n'),
      'utf8',
    );
  }

  async function readRaw() {
    return readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  }

  /** Parse the workspace file so we can assert exact values at exact key-paths. */
  async function readParsed() {
    return parse(await readRaw());
  }

  it('is a no-op when there is no pnpm-workspace.yaml', async () => {
    await expect(injestCatalogs(root)).resolves.toBeUndefined();
    await expect(updateCatalogs(root, c())).resolves.toBeUndefined();
  });

  it('rewrites the default and named catalogs independently to the highest in-range version', async () => {
    await writeWorkspace([
      'packages:',
      '  - "*"',
      '',
      '# Shared versions',
      'catalog:',
      '  react: ^18.2.0',
      '',
      'catalogs:',
      '  legacy:',
      '    react: ^17.0.1',
      '',
    ]);

    // A package elsewhere in the repo uses newer versions in *both* ranges.
    setDetectedDeps('react', ['^18.2.0', '^18.3.1', '^17.0.1', '^17.0.2']);

    await injestCatalogs(root);
    await updateCatalogs(root, c({ 'write-as': 'minors' }));

    const parsed = await readParsed();

    // Each catalog is bumped within its *own* range -- assert the exact value
    // at the exact key-path so we know which catalog got which version.
    expect(parsed.catalog.react).toBe('^18.3.1');
    expect(parsed.catalogs.legacy.react).toBe('^17.0.2');

    // The stale versions must be gone (guards against append-instead-of-replace).
    const raw = await readRaw();

    expect(raw).not.toContain('^18.2.0');
    expect(raw).not.toContain('^17.0.1');

    // Structure + comments are preserved.
    expect(raw).toContain('# Shared versions');
    expect(parsed.packages).toEqual(['*']);
  });

  it('bumps a catalog when a package.json uses a newer in-range version', async () => {
    await writeWorkspace(['catalog:', '  lodash: ^4.17.15', '']);

    // The catalog declares ^4.17.15 ...
    await injestCatalogs(root);
    // ... but a package.json in the repo depends on a newer, in-range version.
    injestDeps({
      name: 'a',
      version: '1.0.0',
      dependencies: { lodash: '^4.17.21' },
    });

    await updateCatalogs(root, c({ 'write-as': 'minors' }));

    const parsed = await readParsed();

    expect(parsed.catalog.lodash).toBe('^4.17.21');
  });

  it('bumps a catalog when the newer version is in a package.json devDependency', async () => {
    await writeWorkspace(['catalog:', '  lodash: ^4.17.15', '']);

    await injestCatalogs(root);
    injestDeps({
      name: 'a',
      version: '1.0.0',
      devDependencies: { lodash: '^4.17.20' },
    });

    await updateCatalogs(root, c({ 'write-as': 'minors' }));

    const parsed = await readParsed();

    expect(parsed.catalog.lodash).toBe('^4.17.20');
  });

  it('does not bump a catalog past its configured range', async () => {
    await writeWorkspace(['catalog:', '  lodash: ^4.17.15', '']);

    await injestCatalogs(root);
    // A newer version exists in the repo, but it's a new major -- out of ^4.
    injestDeps({
      name: 'a',
      version: '1.0.0',
      dependencies: { lodash: '^5.0.0' },
    });

    await updateCatalogs(root, c({ 'write-as': 'minors' }));

    const parsed = await readParsed();

    // Unchanged: the out-of-range version is ignored.
    expect(parsed.catalog.lodash).toBe('^4.17.15');
  });
});
