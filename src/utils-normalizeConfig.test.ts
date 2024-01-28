import { describe, expect as e, it } from 'vitest';

import { normalizeConfig } from './utils.js';

const expect = e.soft;

describe('normalizeConfig', () => {
  it('no passed config', () => {
    expect(normalizeConfig()).toMatchInlineSnapshot(`
      {
        "overrides": [],
        "update-range": {
          "^": [],
          "~": [],
        },
        "write-as": "pinned",
      }
    `);
  });

  it('overrides "write-as"', () => {
    expect(normalizeConfig({ 'write-as': "minors" })).toMatchInlineSnapshot(`
      {
        "overrides": [],
        "update-range": {
          "^": [],
          "~": [],
        },
        "write-as": "minors",
      }
    `);
  });

  it('specifies overrides', () => {
    expect(normalizeConfig({
      overrides: [
        {
          path: 'x/y/z',
          devDependencies: false,
          dependencies: false,
        }
      ]
    })).toMatchInlineSnapshot(`
      {
        "overrides": [
          {
            "dependencies": false,
            "devDependencies": false,
            "path": [
              "x/y/z",
            ],
          },
        ],
        "update-range": {
          "^": [],
          "~": [],
        },
        "write-as": "pinned",
      }
    `);
  });

  it('specifies update-range', () => {
    expect(normalizeConfig({
      'update-range': {
        '~': [
          'ember-data',
        ],
        '^': [
          '@ember-data/*'
        ],
      }
    })).toMatchInlineSnapshot(`
      {
        "overrides": [],
        "update-range": {
          "^": [
            "@ember-data/*",
          ],
          "~": [
            "ember-data",
          ],
        },
        "write-as": "pinned",
      }
    `);
  });
});
