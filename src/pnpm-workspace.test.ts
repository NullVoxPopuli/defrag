import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach, describe, expect as e, it } from 'vitest';

import { c } from './-tests/helpers.ts';
import { injestCatalogs, updateCatalogs } from './pnpm-workspace.js';
import { setDetectedDeps } from './utils.js';

const expect = e.soft;

describe('pnpm catalogs', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'defrag-catalog-'));
  });

  async function writeWorkspace(contents: string) {
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), contents, 'utf8');
  }

  async function readWorkspace() {
    return readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
  }

  it('is a no-op when there is no pnpm-workspace.yaml', async () => {
    await expect(injestCatalogs(root)).resolves.toBeUndefined();
    await expect(updateCatalogs(root, c())).resolves.toBeUndefined();
  });

  it('ingests and rewrites default + named catalogs, preserving comments', async () => {
    await writeWorkspace(
      [
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
      ].join('\n'),
    );

    // Pretend a package elsewhere in the repo uses newer versions
    setDetectedDeps('react', ['^18.2.0', '^18.3.1', '^17.0.1', '^17.0.2']);

    await injestCatalogs(root);
    await updateCatalogs(root, c({ 'write-as': 'minors' }));

    const result = await readWorkspace();

    // Default catalog bumped to the highest in-range (^) version
    expect(result).toContain('react: ^18.3.1');
    // Named catalog bumped within its own major range
    expect(result).toContain('react: ^17.0.2');
    // Structure + comments preserved
    expect(result).toContain('# Shared versions');
    expect(result).toContain('packages:');
    expect(result).toContain('legacy:');
  });
});
