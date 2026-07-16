import { beforeEach, describe, expect as e, it } from 'vitest';

import { c } from './-tests/helpers.ts';
import {
  catalogRefFor,
  resetDetectedDeps,
  setDetectedDeps,
  updateManifestFor,
} from './utils.js';

import type { CatalogEntry, CatalogVersions } from './types.ts';

const expect = e.soft;

function entry(overrides: Partial<CatalogEntry>): CatalogEntry {
  return {
    ref: 'catalog:',
    version: '18.3.1',
    range: '^18.2.0',
    isDefault: true,
    order: 0,
    ...overrides,
  };
}

function catalogs(map: Record<string, CatalogEntry[]>): CatalogVersions {
  return new Map(Object.entries(map));
}

describe('catalogRefFor', () => {
  it('swaps on an exact match', () => {
    const cat = catalogs({ react: [entry({ version: '18.3.1' })] });

    expect(catalogRefFor('react', '18.3.1', cat)).toBe('catalog:');
  });

  it('does not swap when the version differs', () => {
    const cat = catalogs({ react: [entry({ version: '18.3.1' })] });

    // In-range but not identical -- exact match only.
    expect(catalogRefFor('react', '18.2.0', cat)).toBe(null);
    expect(catalogRefFor('react', '^18.3.1', cat)).toBe(null);
  });

  it('does not swap a dependency the catalogs do not declare', () => {
    const cat = catalogs({ react: [entry({ version: '18.3.1' })] });

    expect(catalogRefFor('lodash', '18.3.1', cat)).toBe(null);
  });

  it('leaves an existing catalog reference untouched (never matches a real version)', () => {
    const cat = catalogs({ react: [entry({ version: '18.3.1' })] });

    expect(catalogRefFor('react', 'catalog:', cat)).toBe(null);
    expect(catalogRefFor('react', 'catalog:legacy', cat)).toBe(null);
  });

  it('emits a named catalog reference when only the named catalog matches', () => {
    const cat = catalogs({
      react: [
        entry({
          ref: 'catalog:',
          version: '18.3.1',
          isDefault: true,
          order: 0,
        }),
        entry({
          ref: 'catalog:legacy',
          version: '17.0.2',
          range: '^17.0.1',
          isDefault: false,
          order: 1,
        }),
      ],
    });

    expect(catalogRefFor('react', '17.0.2', cat)).toBe('catalog:legacy');
  });

  it('prefers the narrowest matching catalog range', () => {
    const cat = catalogs({
      react: [
        entry({
          ref: 'catalog:',
          version: '18.3.1',
          range: '^18.0.0',
          isDefault: true,
          order: 0,
        }),
        entry({
          ref: 'catalog:tight',
          version: '18.3.1',
          range: '^18.2.0',
          isDefault: false,
          order: 1,
        }),
      ],
    });

    // ^18.2.0 is a subset of ^18.0.0, so the named "tight" catalog wins even
    // though the default catalog also matches.
    expect(catalogRefFor('react', '18.3.1', cat)).toBe('catalog:tight');
  });

  it('falls back to the default catalog when ranges are equally narrow', () => {
    const cat = catalogs({
      react: [
        entry({
          ref: 'catalog:a',
          version: '18.3.1',
          range: '^18.2.0',
          isDefault: false,
          order: 0,
        }),
        entry({
          ref: 'catalog:',
          version: '18.3.1',
          range: '^18.2.0',
          isDefault: true,
          order: 1,
        }),
      ],
    });

    expect(catalogRefFor('react', '18.3.1', cat)).toBe('catalog:');
  });
});

describe('updateManifestFor with catalogs', () => {
  beforeEach(() => {
    resetDetectedDeps();
  });

  it('swaps a de-fragmented dependency to the catalog reference', () => {
    setDetectedDeps('react', ['18.2.0', '18.3.1']);
    const cat = catalogs({ react: [entry({ version: '18.3.1' })] });

    const deps: Record<string, string> = { react: '18.2.0' };
    updateManifestFor(deps, c(), cat);

    // 18.2.0 de-frags to 18.3.1, which matches the catalog exactly -> swapped.
    expect(deps.react).toBe('catalog:');
  });

  it('writes a plain version when there is no exact catalog match', () => {
    setDetectedDeps('react', ['18.2.0', '18.3.1']);
    const cat = catalogs({ react: [entry({ version: '17.0.2' })] });

    const deps: Record<string, string> = { react: '18.2.0' };
    updateManifestFor(deps, c(), cat);

    expect(deps.react).toBe('18.3.1');
  });

  it('does not swap when no catalogs are passed', () => {
    setDetectedDeps('react', ['18.2.0', '18.3.1']);

    const deps: Record<string, string> = { react: '18.2.0' };
    updateManifestFor(deps, c());

    expect(deps.react).toBe('18.3.1');
  });
});
