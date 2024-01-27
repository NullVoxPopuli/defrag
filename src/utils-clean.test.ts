import { describe, expect as e, it } from 'vitest';

import { clean } from './utils.js';

const expect = e.soft;

describe('clean', () => {
  const tests = [
    ['1.0.0', '1.0.0'],
    ['^1.0.0', '1.0.0'],
    ['^1.0.0-tag', '1.0.0-tag'],
    ['^1', '1.0.0'],
    ['^1.0.x', '1.0.0'],
    ['^1.0', '1.0.0'],
  ] as const;

  for (let test of tests) {
    let [input, expected] = test;

    it(`clean(${input}) === ${expected}`, () => {
      expect(clean(input)).toBe(expected);
    });
  }
});
