import type { Package } from '@manypkg/get-packages';

export type Manifest = Package['packageJson'];

type Range = 'pinned' | 'minors' | 'patches';

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
  }[]
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
  }[]
}
