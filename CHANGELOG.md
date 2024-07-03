# Changelog

## [1.8.1] - 2024-06-18

### Bug Fixes

- Named export `Hook` missing from types (#92)
- `parentResolve` is not a function (#100)
- CommonJs bare specifier resolution (#96)
- Explicitly named exports should be exported over `export *` (#103)
- Fallback to `parentLoad` if parsing fails (#104)

## [1.8.0] - 2024-05-31

### Features

- Add `Hook` named export (#88)

### Bug Fixes

- Handle cyclical reference to current file (#83)
- Resolve re-exports of external modules (#78)
- Handling of default and star exports (#85)

### Testing

- Skip static-import on > v21 (#81)

### Miscellaneous Tasks

- Don't create a package-lock file (#67)

## [1.7.4] - 2024-04-30

### Bug Fixes

- Ensure the hooked module exports has @@toStringTag property (#66)

