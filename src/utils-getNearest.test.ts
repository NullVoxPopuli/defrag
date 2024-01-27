/* eslint-disable @typescript-eslint/ban-ts-comment */
import { describe, expect as e, it } from 'vitest';

import { getNearest } from './utils.js';

const expect = e.soft;

describe('getNearest', () => {
  describe('strategy: ^ (minors)', () => {
    const minorsTests = [
      ['8.0.0', ['^8.0.0', '^7.0.0', '^8.9.0', '^8.0.3'], '8.9.0'],
      ['7.0.0', ['^8.0.0', '^7.0.0', '^8.9.0', '^8.0.3'], '7.0.0'],
      ['6.0.0', ['^8.0.0', '^7.0.0', '^8.9.0', '^8.0.3'], '6.0.0'],
    ] as const;

    for (let test of minorsTests) {
      let [version, availableVersions, expected] = test;

      it(`getNearest(${version}, ...) === ${expected}`, () => {
        let result = getNearest(version, {
          versions: new Set(availableVersions),
          strategy: '^',
        });

        expect(result).toBe(expected);
      });
    }
  });

  describe('strategy: ~ (patches)', () => {
    const minorsTests = [
      ['8.0.0', ['^8.0.0', '^7.0.0', '^8.9.0', '^8.0.3'], '8.0.3'],
      ['7.0.0', ['^8.0.0', '^7.0.0', '^8.9.0', '^8.0.3'], '7.0.0'],
      ['6.0.0', ['^8.0.0', '^7.0.0', '^8.9.0', '^8.0.3'], '6.0.0'],
    ] as const;

    for (let test of minorsTests) {
      let [version, availableVersions, expected] = test;

      it(`getNearest(${version}, ...) === ${expected}`, () => {
        let result = getNearest(version, {
          versions: new Set(availableVersions),
          strategy: '~',
        });

        expect(result).toBe(expected);
      });
    }
  });
});
