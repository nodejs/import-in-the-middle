// EXPERIMENTAL: not covered by semantic versioning. This API may change or
// be removed in any release, including patch releases, without a
// deprecation period.
//
// Public entry point for the standalone wrapper API. Its implementation lives
// in `wrapper/`; the facade core shared with the loaders lives in `lib/`.

export { createWrapperModule, createWrapperModuleSync } from './wrapper/create-wrapper.mjs'
