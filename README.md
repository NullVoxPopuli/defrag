# Defrag

De-fragment the dependencies your monorepo, reducing the number of copies of in-range dependencies 

This will sync all the versions in your monorepo to the same version, _within_ the configured range.

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
#  pinned
#  patches
#  minors
write-as: pinned

# Default assumes every package follows semver and
# is 100% safe to upgrade within semver ranges.
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

## What does this do?


The algorithm is this:
```
scan all workspaces,
  find the dependencies, adding their versions to a list
for each workspace
  for each dependency
    re-assign an in-range version to the highest the monorepo was already using
```
- reduces lockfile size
- reduces duplicate depenedncies
- allows package managers that "hoist" dependencies to be likely more correct
