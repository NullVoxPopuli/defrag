/* eslint-disable @typescript-eslint/ban-ts-comment */
import { describe, expect as e, it } from 'vitest';

import { c } from './-tests/helpers.ts';
import { getVersionForConfig, setDetectedDeps } from './utils.js';

const expect = e.soft;

describe('getVersionForConfig', () => {
  let defaultConfig = c();

  function withConfig(config = defaultConfig) {
    return function verify(name: string, current: string, available: string[]) {
      setDetectedDeps(name, available);

      return getVersionForConfig(name, current, config);
    };
  }

  it('pinned', () => {
    const verify = withConfig();

    expect(verify('eslint', '^8.0.0', ['^8.0.0', '^7.0.0', '^8.9.0'])).toBe(
      '8.9.0',
    );
  });

  it('patches', () => {
    const verify = withConfig(c({ 'write-as': 'patches' }));

    expect(verify('eslint', '^8.0.0', ['^8.0.0', '^7.0.0', '^8.9.0'])).toBe(
      '~8.9.0',
    );
  });

  it('minors', () => {
    const verify = withConfig(c({ 'write-as': 'minors' }));

    expect(verify('eslint', '^8.0.0', ['^8.0.0', '^7.0.0', '^8.9.0'])).toBe(
      '^8.9.0',
    );
  });

  it('pre-release', () => {
    const verify = withConfig();

    expect(
      verify('ember-data', '^5.4.0-beta.1', [
        '^4.12.5',
        '^5.4.0-beta.1',
        '^5.3.0',
      ]),
    ).toBe('5.4.0-beta.1');
  });

  it('restricted to ~', () => {
    const verify = withConfig(
      c({
        'write-as': 'pinned',
        'update-range': {
          '~': ['ember-data'],
          '^': [],
        },
      }),
    );

    expect(
      verify('ember-data', '^5.3.0', ['^4.12.5', '^5.4.0', '^5.3.0', '^5.3.1']),
    ).toBe('5.3.1');
  });
});
