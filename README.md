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
