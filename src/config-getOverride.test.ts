import { describe, expect as e, it } from 'vitest';

import { c } from './-tests/helpers.ts';
import { getOverride } from './config.js';

const expect = e.soft;

describe('getOverride', () => {
  it('resolves a package glob', () => {
    expect(
      getOverride(
        'packages/ember-repl/addon',
        c({
          overrides: [
            {
              path: [
                'packages/*/addon/package.json',
                'packages/syntax/*/package.json',
              ],
              dependencies: false,
              devDependencies: 'pinned',
            },
          ],
        }),
      ),
    ).toMatchInlineSnapshot(`
      {
        "dependencies": false,
        "devDependencies": "pinned",
        "path": [
          "packages/*/addon/package.json",
          "packages/syntax/*/package.json",
        ],
      }
    `);
  });

  it('returns nothing when no match is found', () => {
    expect(
      getOverride(
        'apps/repl',
        c({
          overrides: [
            {
              path: ['packages/*/addon/package.json'],
              dependencies: false,
              devDependencies: 'pinned',
            },
          ],
        }),
      ),
    ).toBe(undefined);
  });
});
