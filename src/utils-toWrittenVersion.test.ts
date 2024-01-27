/* eslint-disable @typescript-eslint/ban-ts-comment */
import { describe, expect as e, it } from 'vitest';

import { c } from './-tests/helpers.ts';
import { toWrittenVersion } from './utils.js';

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
