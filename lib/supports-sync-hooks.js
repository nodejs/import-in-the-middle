// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

// This module intentionally has no imports. `supportsSyncHooks` is a pure
// Node.js version check, and consumers (e.g. a CommonJS preloader deciding
// whether to require the ESM loader at all) need to call it without pulling in
// `create-hook.mjs` and its acorn / cjs-module-lexer dependency graph.

// `process.versions.node` is always "major.minor.patch" (nightlies append a
// "-suffix" that parseInt stops at). Only release lines 22/24/25 need the minor
// and patch, so parse the major eagerly and read those lazily.
const version = process.versions.node
const NODE_MAJOR = parseInt(version, 10)
let NODE_MINOR
let NODE_PATCH

function readMinorAndPatch () {
  const firstDot = version.indexOf('.')
  const secondDot = version.indexOf('.', firstDot + 1)
  NODE_MINOR = parseInt(version.slice(firstDot + 1, secondDot), 10)
  NODE_PATCH = parseInt(version.slice(secondDot + 1), 10)
}

/**
 * Whether the running Node.js can correctly run the synchronous loader via
 * `module.registerHooks`.
 *
 * `module.registerHooks` exists since v22.15, but its synchronous load hook
 * rejected the nullish CommonJS `source` the loader returns for `require()`s
 * pulled into the ESM graph (throwing `ERR_INVALID_RETURN_PROPERTY_VALUE`) until
 * https://github.com/nodejs/node/pull/59929, released in 22.22.3, 24.11.1,
 * 25.1.0 and 26.0.0. Earlier 24.x (<= 24.11.0) and 25.0.0 ship `registerHooks`
 * but predate the fix, so the synchronous loader must fall back to the
 * asynchronous one there.
 *
 */
function supportsSyncHooks () {
  if (NODE_MAJOR >= 26) return true
  if (NODE_MAJOR < 22 || NODE_MAJOR === 23) return false

  readMinorAndPatch()
  if (NODE_MAJOR === 25) return NODE_MINOR >= 1
  if (NODE_MAJOR === 24) return NODE_MINOR > 11 || (NODE_MINOR === 11 && NODE_PATCH >= 1)
  return NODE_MINOR > 22 || (NODE_MINOR === 22 && NODE_PATCH >= 3)
}

module.exports = supportsSyncHooks
