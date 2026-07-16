import type { Package } from '@manypkg/get-packages';

export type Manifest = Package['packageJson'];

type Range = 'pinned' | 'minors' | 'patches';

export type ConfigForUpdate = Pick<Config, 'write-as' | 'update-range'>;

/**
 * A single pnpm catalog's declaration of one dependency, with everything needed
 * to decide whether a package.json dependency can be swapped to reference it.
 */
export interface CatalogEntry {
  /** the reference to write: `catalog:` (default) or `catalog:<name>` */
  ref: string;
  /** the catalog's de-fragmented version, compared for an exact match */
  version: string;
  /** the catalog's original range, used to pick the narrowest match */
  range: string;
  /** whether this is the default (unnamed) catalog */
  isDefault: boolean;
  /** declaration order across all catalogs, used as a final tie-breaker */
  order: number;
}

/** A mapping of dependency name to the catalogs that declare it. */
export type CatalogVersions = Map<string, CatalogEntry[]>;

export interface Config {
  'write-as': Range;
  'update-range': {
    // list of names or globs to match packages against
    '~': string[];
    '^': string[];
    // '>=': string[]
  };
  overrides: {
    path: string[];
    devDependencies: Range | false;
    dependencies: Range | false;
  }[];
}

export interface UserConfig {
  'write-as'?: Range;
  'update-range'?: {
    '~'?: string[];
    '^'?: string[];
  };
  overrides?: {
    path: string | string[];
    devDependencies?: Range | false;
    dependencies?: Range | false;
  }[];
}
