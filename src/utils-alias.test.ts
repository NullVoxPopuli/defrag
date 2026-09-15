import { beforeEach, describe, expect as e, it } from 'vitest';

import { c } from './-tests/helpers.ts';
import {
  formatAlias,
  getVersionForConfig,
  injestDeps,
  parseAlias,
  resetDetectedDeps,
  setDetectedDeps,
  toWrittenVersion,
  updateManifestFor,
} from './utils.js';

const expect = e.soft;

describe('parseAlias', () => {
  it('splits an alias into the real package and its range', () => {
    expect(parseAlias('npm:typescript@7.1.0-dev.20260904.1')).toEqual({
      name: 'typescript',
      range: '7.1.0-dev.20260904.1',
    });
    expect(parseAlias('npm:ember-scoped-css@2.0.4')).toEqual({
      name: 'ember-scoped-css',
      range: '2.0.4',
    });
    expect(parseAlias('npm:typescript@^7.1.0')).toEqual({
      name: 'typescript',
      range: '^7.1.0',
    });
  });

  it('handles scoped packages', () => {
    // The leading `@` belongs to the scope, not the name/range separator.
    expect(parseAlias('npm:@embroider/core@^3.0.0')).toEqual({
      name: '@embroider/core',
      range: '^3.0.0',
    });
  });

  it('is null for non-aliases and aliases without a version', () => {
    expect(parseAlias('^7.1.0')).toBe(null);
    expect(parseAlias('catalog:')).toBe(null);
    expect(parseAlias('workspace:*')).toBe(null);
    // no version -> nothing to de-fragment
    expect(parseAlias('npm:typescript')).toBe(null);
    expect(parseAlias('npm:@embroider/core')).toBe(null);
    expect(parseAlias('npm:typescript@')).toBe(null);
    expect(parseAlias('npm:@1.0.0')).toBe(null);
  });

  it('round-trips through formatAlias', () => {
    for (let alias of [
      'npm:typescript@7.1.0-dev.20260904.1',
      'npm:@embroider/core@^3.0.0',
    ]) {
      let parsed = parseAlias(alias);

      expect(parsed && formatAlias(parsed.name, parsed.range)).toBe(alias);
    }
  });
});

describe('aliased dependencies', () => {
  beforeEach(() => {
    resetDetectedDeps();
  });

  describe('getVersionForConfig', () => {
    it('de-fragments the range and keeps the alias', () => {
      setDetectedDeps('typescript-7', ['npm:typescript@7.1.0', '^7.0.0']);

      expect(
        getVersionForConfig('typescript-7', 'npm:typescript@^7.0.0', c()),
      ).toBe('npm:typescript@7.1.0');
      expect(
        getVersionForConfig(
          'typescript-7',
          'npm:typescript@^7.0.0',
          c({ 'write-as': 'minors' }),
        ),
      ).toBe('npm:typescript@^7.1.0');
    });

    it('is keyed on the user-defined name, not the real package', () => {
      // `typescript` (the real package) has a newer version in the repo, but
      // that must not leak into the `typescript-7` alias.
      setDetectedDeps('typescript', ['7.2.0']);
      setDetectedDeps('typescript-7', ['npm:typescript@7.1.0']);

      expect(
        getVersionForConfig('typescript-7', 'npm:typescript@7.1.0', c()),
      ).toBe('npm:typescript@7.1.0');
    });

    it('handles scoped aliases (which contain a `/`)', () => {
      setDetectedDeps('core-v3', ['npm:@embroider/core@3.1.0']);

      expect(
        getVersionForConfig('core-v3', 'npm:@embroider/core@^3.0.0', c()),
      ).toBe('npm:@embroider/core@3.1.0');
    });

    it('handles pre-release aliases', () => {
      setDetectedDeps('typescript-7', [
        'npm:typescript@7.1.0-dev.20260904.1',
        'npm:typescript@7.1.0-dev.20260901.1',
      ]);

      expect(
        getVersionForConfig(
          'typescript-7',
          'npm:typescript@7.1.0-dev.20260901.1',
          c(),
        ),
      ).toBe('npm:typescript@7.1.0-dev.20260904.1');
    });

    it('leaves an alias without a version untouched', () => {
      // Without special handling, `clean` would coerce the `2` in `vue2`
      // into a version.
      setDetectedDeps('vue', ['npm:vue2', '^2.7.0']);

      expect(getVersionForConfig('vue', 'npm:vue2', c())).toBe('npm:vue2');
    });
  });

  describe('toWrittenVersion', () => {
    it('applies write-as to the range, keeping the alias', () => {
      expect(toWrittenVersion('npm:typescript@^7.1.0', c())).toBe(
        'npm:typescript@7.1.0',
      );
      expect(
        toWrittenVersion('npm:typescript@7.1.0', c({ 'write-as': 'minors' })),
      ).toBe('npm:typescript@^7.1.0');
      expect(
        toWrittenVersion('npm:typescript@7.1.0', c({ 'write-as': 'patches' })),
      ).toBe('npm:typescript@~7.1.0');
      expect(toWrittenVersion('npm:@embroider/core@^3.0.0', c())).toBe(
        'npm:@embroider/core@3.0.0',
      );
    });

    it('passes through an alias without a version', () => {
      expect(toWrittenVersion('npm:vue2', c())).toBe('npm:vue2');
    });
  });

  describe('injestDeps', () => {
    it('records the alias range under the user-defined key only', () => {
      injestDeps({
        name: 'a',
        version: '1.0.0',
        dependencies: { 'typescript-7': 'npm:typescript@7.1.0' },
        devDependencies: {
          'ember-scoped-css-v2': 'npm:ember-scoped-css@2.0.4',
        },
      });

      // Ranges were recorded under the user-defined keys ...
      expect(
        getVersionForConfig('typescript-7', 'npm:typescript@^7.0.0', c()),
      ).toBe('npm:typescript@7.1.0');
      expect(
        getVersionForConfig(
          'ember-scoped-css-v2',
          'npm:ember-scoped-css@^2.0.0',
          c(),
        ),
      ).toBe('npm:ember-scoped-css@2.0.4');
      // ... and nothing was recorded under the real package names, so an
      // un-aliased `typescript` elsewhere in the repo is unaffected.
      expect(getVersionForConfig('typescript', '^5.0.0', c())).toBe('^5.0.0');
    });
  });

  describe('updateManifestFor', () => {
    it('de-fragments aliased dependencies in place', () => {
      setDetectedDeps('typescript-7', [
        'npm:typescript@7.1.0-dev.20260904.1',
        'npm:typescript@7.1.0-dev.20260901.1',
      ]);

      const deps = {
        'typescript-7': 'npm:typescript@7.1.0-dev.20260901.1',
      };

      updateManifestFor(deps, c());

      expect(deps).toEqual({
        'typescript-7': 'npm:typescript@7.1.0-dev.20260904.1',
      });
    });

    it('swaps to a catalog reference on an exact aliased match', () => {
      setDetectedDeps('typescript-7', ['npm:typescript@7.1.0', '^7.0.0']);

      const deps = { 'typescript-7': 'npm:typescript@^7.0.0' };

      updateManifestFor(
        deps,
        c(),
        new Map([
          [
            'typescript-7',
            [
              {
                ref: 'catalog:',
                version: 'npm:typescript@7.1.0',
                range: '^7.0.0',
                isDefault: true,
                order: 0,
              },
            ],
          ],
        ]),
      );

      expect(deps).toEqual({ 'typescript-7': 'catalog:' });
    });

    it('does not swap to a catalog that aliases a different real package', () => {
      setDetectedDeps('ts', ['npm:typescript@7.1.0']);

      const deps = { ts: 'npm:typescript@7.1.0' };

      updateManifestFor(
        deps,
        c(),
        new Map([
          [
            'ts',
            [
              {
                ref: 'catalog:',
                // same user-defined key and version, but a different package
                version: 'npm:typescript-fork@7.1.0',
                range: '7.1.0',
                isDefault: true,
                order: 0,
              },
            ],
          ],
        ]),
      );

      expect(deps).toEqual({ ts: 'npm:typescript@7.1.0' });
    });
  });
});
