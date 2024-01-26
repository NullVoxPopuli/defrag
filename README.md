# Defrag

De-fragment the dependencies your monorepo.

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
