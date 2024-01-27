/* eslint-disable @typescript-eslint/ban-ts-comment */
import { describe, expect as e, it } from 'vitest';

import { c } from './-tests/helpers.ts';
import {
  getNearest,
  getVersionForConfig,
  setDetectedDeps,
  toWrittenVersion,
} from './utils.js';

const expect = e.soft;

describe('toWrittenVersion', () => {
  it('errors on invalid "write-as" config', () => {
    // @ts-expect-error
    expect(() => toWrittenVersion('1.0.0', { 'write-as': 'x' })).toThrowError(
      `Unknown 'write-as' config: x. Allowed: 'pinned', 'patches', and 'minors'`,
    );
  });

  it('passes through non-versions', () => {
    let config = c();

    expect(toWrittenVersion('*', config)).toBe('*');
    expect(toWrittenVersion('$namedVersion', config)).toBe('$namedVersion');
    expect(toWrittenVersion('workspace:*', config)).toBe('workspace:*');
    expect(toWrittenVersion('workspace:^1.0.0', config)).toBe(
      'workspace:^1.0.0',
    );
    expect(toWrittenVersion('github:owner/repo', config)).toBe(
      'github:owner/repo',
    );
    expect(toWrittenVersion('github:owner/repo#sha', config)).toBe(
      'github:owner/repo#sha',
    );
    expect(toWrittenVersion('file:///whatever', config)).toBe(
      'file:///whatever',
    );
    expect(toWrittenVersion('owner/repo', config)).toBe('owner/repo');
    expect(toWrittenVersion('owner/repo#sha', config)).toBe('owner/repo#sha');
    expect(toWrittenVersion('https://path.com/file.tgz', config)).toBe(
      'https://path.com/file.tgz',
    );
  });

  it('pinned', () => {
    let config = c();

    expect(toWrittenVersion('0.0.0', config)).toBe('0.0.0');
    expect(toWrittenVersion('1.0.0', config)).toBe('1.0.0');
    expect(toWrittenVersion('^1.0.0', config)).toBe('1.0.0');
    expect(toWrittenVersion('~1.0.0', config)).toBe('1.0.0');
    expect(toWrittenVersion('~1.0.0-security', config)).toBe('1.0.0-security');

    // invalid versions that try to have a range
    expect(toWrittenVersion('^1.0.x', config)).toBe('1.0.0');
  });

  it('minors', () => {
    let config = c({ 'write-as': 'minors' });

    expect(toWrittenVersion('0.0.0', config)).toBe('^0.0.0');
    expect(toWrittenVersion('1.0.0', config)).toBe('^1.0.0');
    expect(toWrittenVersion('^1.0.0', config)).toBe('^1.0.0');
    expect(toWrittenVersion('~1.0.0', config)).toBe('^1.0.0');
    expect(toWrittenVersion('~1.0.0-security', config)).toBe('^1.0.0-security');
  });

  it('patches', () => {
    let config = c({ 'write-as': 'patches' });

    expect(toWrittenVersion('0.0.0', config)).toBe('~0.0.0');
    expect(toWrittenVersion('1.0.0', config)).toBe('~1.0.0');
    expect(toWrittenVersion('^1.0.0', config)).toBe('~1.0.0');
    expect(toWrittenVersion('~1.0.0', config)).toBe('~1.0.0');
    expect(toWrittenVersion('~1.0.0-security', config)).toBe('~1.0.0-security');
  });
});

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

describe('getNearest', () => {
  it('works', () => {
    expect(
      getNearest('8.0.0', {
        versions: new Set(['^8.0.0', '^7.0.0', '^8.9.0']),
        strategy: '^',
      }),
    ).toBe('8.9.0');
    expect(
      getNearest('8.9.0', {
        versions: new Set(['^8.0.0', '^7.0.0', '^8.9.0']),
        strategy: '^',
      }),
    ).toBe('8.9.0');
    expect(
      getNearest('7.0.0', {
        versions: new Set(['^8.0.0', '^7.0.0', '^8.9.0']),
        strategy: '^',
      }),
    ).toBe('7.0.0');
    expect(
      getNearest('6.0.0', {
        versions: new Set(['^8.0.0', '^7.0.0', '^8.9.0']),
        strategy: '^',
      }),
    ).toBe('6.0.0');
  });
});
