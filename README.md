# Defrag

De-fragment the dependencies your monorepo, reducing the number of copies of in-range dependencies 

This will sync all the versions in your monorepo to the same version, _within_ the configured range.

**Works with all package-managers (pnpm, yarn, npm, etc)**

## Usage

Run in the root of your monorepo

```bash
npx defrag
```

or debug with

```bash
DEBUG=defrag npx defrag
```

## Erroring in C.I.

In GitHub Actions

```yaml
ensure-no-divergence:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: npx defrag
    - run: git diff --exit-code
```

No need to install dependencies for your monorepo to have this verification

## Config

Example `.defragrc.yaml`

```yaml
# When writing to package.json,
# remove the semver-range, pinning the dependencie
# to an exact version.
#
# Possible values:
#  pinned ( default )
#  patches ( e.g.:  ~1.0.0 )
#  minors ( e.g.: ^1.0.0 )
write-as: pinned 

# This whole object is optional, 
# but if your monorepo has public libraries
# where you *need* wider ranges, that can be configured here
# 
# overrides is an array of objects
overrides:
  # path may be either a single glob or an array of glabs
  - path: 
    - packages/*/addon/package.json
    - packages/*/*/package.json
    # for both devDependencies and dependencies
    # in addition to the 3 global options, 
    # pinned, patches, and minors, you may also
    # specify `false` to disable version re-writing entirely
    # (which may be useful for some packages that do 
    #  complex multi-version specifiers)
    devDependencies: pinned
    dependencies: minors 

# Default assumes every package follows semver (minors) and
# is 100% safe to upgrade within those ranges.
#
# in practice, this is only true if all dependencies
# sharing those listed here do not use private APIs.
#
# Due to private API usage (or relying on "undefined" behavior)
# we are more conservative with these ranges and will deal with
# them more manually.
update-range:
  "~":
    - ember-source
    - ember-data
    - "@ember-data/*"
```

## pnpm catalogs

[pnpm catalogs](https://pnpm.io/catalogs) declared in `pnpm-workspace.yaml` are
supported automatically -- no extra config needed.

```yaml
catalog:
  react: ^18.2.0

catalogs:
  legacy:
    react: ^17.0.1
```

- The versions declared in the default `catalog` and any named `catalogs`
  participate in de-fragmentation alongside the versions found in each
  `package.json`.
- Those catalog entries are re-written in place (comments and formatting are
  preserved), using the same rules as npm `overrides`, yarn `resolutions`, and
  `pnpm.overrides` -- i.e. the top-level config, since catalogs are
  workspace-wide.
- `catalog:` / `catalog:<name>` references inside a `package.json` are treated
  as non-versions and left untouched.

### Swapping package.json versions to `catalog:`

When catalogs are present, `defrag` also propagates them: after a
`package.json` dependency has been de-fragmented, if its resulting version is an
**exact match** for a catalog entry, the plain version is swapped out for the
catalog reference.

```yaml
# pnpm-workspace.yaml
catalog:
  react: ^18.3.1
```

```jsonc
// packages/app/package.json (before)
{ "dependencies": { "react": "^18.2.0" } }

// after -- ^18.2.0 de-frags to ^18.3.1, which matches the catalog exactly
{ "dependencies": { "react": "catalog:" } }
```

- The swap is only made on an exact match of the de-fragmented versions, so
  adopting the catalog never widens or narrows what the package accepts. A
  version that is merely *in range* (but not identical) is left as a plain
  version.
- When more than one catalog declares the dependency at that same version, the
  catalog with the narrowest range wins (ties fall back to the default
  `catalog:`, then declaration order). Named catalogs are written as
  `catalog:<name>`.
- This happens automatically whenever a `pnpm-workspace.yaml` with catalogs is
  detected -- no extra config needed. Dependency collections disabled via an
  `overrides` entry (`dependencies: false` / `devDependencies: false`) are left
  untouched, catalog swap included.

## Questions

### Disable for sub-folders?

```yaml
overrides:
  - path: packages/**/*
    devDependencies: false
    dependencies: false 
```

### What does this do?

The algorithm is this:
```
scan all workspaces' package.json,
  find the dependencies, adding their versions to a list
for each workspace
  for each dependency
    re-assign an in-range version to the highest the monorepo was already using
```
- reduces lockfile size
- reduces duplicate depenedncies
- allows package managers that "hoist" dependencies to be likely more correct

### How is this different from dedupe?

Dedupe operates on the lockfile, only and `defrag` gives you more control over _what_ dedupes, based on ranges in a configured `.defragrc.yaml`.
additionally, this tool gives the ability to `pin` versions, whereas dedupe would use whatever resolved dependency version satisfies the pre-existing `^` range.

### Can this break my lockfile? 

If a package.json using a version format that isn't actually a version (and not yet accounted for), this is likely a bug -- the desired behavior is to ignore invalid versions and opt them out of being changed by this tool.
