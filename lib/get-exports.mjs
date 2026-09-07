'use strict'

import { lexEsm } from './get-esm-exports.mjs'
import { parse as parseCjs, initSync } from 'cjs-module-lexer'
import { readFileSync, existsSync } from 'fs'
import { builtinModules, createRequire } from 'module'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, join } from 'path'
import { LOAD } from './io.mjs'

const nodeMajor = Number(process.versions.node.split('.')[0])
export const hasModuleExportsCJSDefault = nodeMajor >= 23

/** @typedef {{ specifier: string, parentURL: string }} StarReexport */
/** @typedef {{ exportNames: Iterable<string>, starReexports?: StarReexport[] }} ModuleExports */

let parserInitialized = false
let stripTypeScriptTypes

// The CJS export scanner is backed by WebAssembly. `initSync` compiles it
// up front so the scanner can run inside synchronous loader hooks
// (`module.registerHooks`) as well as the off-thread loader; it is a one-time
// cost on the first CommonJS module either way.
function ensureParserInitialized () {
  if (!parserInitialized) {
    initSync()
    parserInitialized = true
  }
}

/** @param {string[]} exportNames The detected CommonJS exports. */
function addDefault (exportNames) {
  const result = new Set(['default'])
  for (const name of exportNames) result.add(name)
  return result
}

// Cached exports for Node built-in modules
const BUILT_INS = new Map()

let require

// Returns a builtin's exports object. `process.getBuiltinModule` (Node >=
// 20.16 / >= 22.3) bypasses registered loader hooks; `require` does not. Under
// the in-thread `module.registerHooks` loader a plain `require(name)` here
// re-enters iitm's own hooks and resolves to the half-built wrapper instead of
// the native module. The off-thread `module.register` loader runs `require` on
// the loader thread where the hooks aren't installed, so the fallback stays
// correct on older Node that lacks getBuiltinModule.
function loadBuiltin (name) {
  if (typeof process.getBuiltinModule === 'function') {
    return process.getBuiltinModule(name)
  }
  if (!require) {
    require = createRequire(import.meta.url)
  }
  return require(name)
}

function getExportsForNodeBuiltIn (name) {
  let exports = BUILT_INS.get(name)

  if (!exports) {
    // get all properties both enumerable and non-enumerable
    exports = addDefault(Object.getOwnPropertyNames(loadBuiltin(name)))
    // added in node 23 as alias for default in cjs modules
    if (hasModuleExportsCJSDefault) {
      exports.add('module.exports')
    }
    BUILT_INS.set(name, exports)
  }

  return exports
}

const urlsBeingProcessed = new Set() // Guard against circular imports.

// Memoizes an ESM module's export names and stars by URL. A leaf reached from
// several barrels (`export *`) would otherwise be read and lexed once per
// barrel; the same URL reached from separate top-level wraps would be lexed once
// per wrap. The first lex serves every later one.
//
// This assumes a module's export names are stable for the process: the memo
// serves a later, independent scan without re-running the loader chain's
// `load()`, so a loader that returns a *different export set* for the same URL
// across calls (a stateful codegen loader, or one keyed off `context`) is a
// deliberately unsupported case — it would be served the first scan's names.
// Idempotent transforms (type stripping, AST instrumentation such as
// OrchestrionJS, minifiers) are stable and unaffected; the wrapper's real
// namespace `load()` still runs every time, so per-load source differences in
// the *executed* module are preserved (see the wrapper's `import * as
// namespace`). Only the pure ESM result is cached: the CommonJS path mutates
// `context.format` and resolves re-exports, and builtins memoize via BUILT_INS.
const esmExportsCache = new Map()

/**
 * This function looks for the package.json which contains the specifier trying to resolve.
 * Once the package.json file has been found, we extract the file path from the specifier
 * @param {string} specifier The specifier that is being search for inside the imports object
 * @param {URL|string} fromUrl The url from which the search starts from
 * @returns array with url and resolvedExport
 */
function resolvePackageImports (specifier, fromUrl) {
  try {
    const fromPath = fileURLToPath(fromUrl)
    let currentDir = dirname(fromPath)

    // search for package.json file which has the real url to export
    while (currentDir !== dirname(currentDir)) {
      const packageJsonPath = join(currentDir, 'package.json')

      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
        if (packageJson.imports && packageJson.imports[specifier]) {
          const imports = packageJson.imports[specifier]

          // Look for path inside packageJson
          let resolvedExport
          if (imports && typeof imports === 'object') {
            const requireExport = imports.require
            const importExport = imports.import
            // look for the possibility of require and import which is standard for CJS/ESM
            if (requireExport || importExport) {
              // trying to resolve based on order of importance
              resolvedExport = requireExport.node || requireExport.default || importExport.node || importExport.default
            } else if (imports.node || imports.default) {
              resolvedExport = imports.node || imports.default
            }
          } else if (typeof imports === 'string') {
            resolvedExport = imports
          }

          if (resolvedExport) {
            const url = resolvedExport.startsWith('.')
              ? pathToFileURL(join(currentDir, resolvedExport))
              : fromUrl
            return [url, resolvedExport]
          }
        }
        // return if we find a package.json but did not find an import
        return null
      }

      currentDir = dirname(currentDir)
    }
  } catch (cause) {
    throw Error(`Failed to find export: ${specifier}`, { cause })
  }
  return null
}

/**
 * @param {string} url The CommonJS module URL.
 * @param {object} context The loader context.
 * @param {string} source The module source.
 * @returns {Generator<Array, ModuleExports>}
 */
function * getCjsExports (url, context, source) {
  if (urlsBeingProcessed.has(url)) {
    return { exportNames: new Set() }
  }
  urlsBeingProcessed.add(url)

  try {
    ensureParserInitialized()
    const result = parseCjs(source)
    const full = addDefault(result.exports)
    let starReexports

    for (const reexport of result.reexports) {
      if (reexport.startsWith('node:') || builtinModules.includes(reexport)) {
        for (const each of getExportsForNodeBuiltIn(reexport)) {
          full.add(each)
        }
        continue
      }

      // Resolve each re-export relative to the current module. Keep the
      // resolution scoped to this iteration: a `#`-import rewrites both the
      // base URL and the specifier, and that rewrite must not leak into the
      // next re-export.
      let reUrl = url
      let reSpecifier = reexport === '.' ? './' : reexport

      // Entries in the import field should always start with #
      if (reSpecifier.startsWith('#')) {
        const resolved = resolvePackageImports(reSpecifier, url)
        if (!resolved) continue
        ;[reUrl, reSpecifier] = resolved
      }

      if (!require) {
        require = createRequire(import.meta.url)
      }
      const newUrl = pathToFileURL(
        require.resolve(reSpecifier, { paths: [dirname(fileURLToPath(reUrl))] })
      ).href

      if (newUrl.endsWith('.node') || newUrl.endsWith('.json')) {
        continue
      }

      const child = yield * getExports(newUrl, context)
      for (const each of child.exportNames) {
        full.add(each)
      }
      if (child.starReexports !== undefined) {
        starReexports ??= []
        for (const starReexport of child.starReexports) {
          starReexports.push(starReexport)
        }
      }
    }

    // added in node 23 as alias for default in cjs modules
    if (hasModuleExportsCJSDefault) {
      full.add('module.exports')
    }

    // we know that it's commonjs at this point, because ESM failed
    context.format = 'commonjs'
    return { exportNames: full, starReexports }
  } finally {
    urlsBeingProcessed.delete(url)
  }
}

/**
 * Inspects a module for its type (commonjs or module), obtains the source code
 * for said module from the loader API, and parses the result for the entities
 * exported from that module.
 *
 * This is a "sans-io" generator: instead of calling the loader's `load` hook
 * directly, it `yield`s `[LOAD, url, context]` and is driven by either
 * {@link driveSync} or {@link driveAsync} (see `lib/io.mjs`). The same body
 * therefore serves both the off-thread loader and `module.registerHooks`.
 *
 * @param {string} url A file URL string pointing to the module that we should
 * get the exports of.
 * @param {object} context Context object as provided by the `load` hook from
 * the loaders API.
 *
 * @returns {Generator<Array, ModuleExports>} A generator that yields I/O
 * operations and ultimately returns the identifiers and star re-exports of the
 * module.
 */
export function * getExports (url, context) {
  const cached = esmExportsCache.get(url)
  if (cached !== undefined) {
    return cached
  }

  // `[LOAD, ...]` gives us the possibility of getting the source from an
  // upstream loader. This doesn't always work though, so later on we fall back
  // to reading it from disk.
  const parentCtx = yield [LOAD, url, context]
  let source = parentCtx.source
  const format = parentCtx.format

  // Loader hooks can return ArrayBuffer / TypedArray sources. Normalize to a
  // string for parsing.
  if (source && typeof source !== 'string') {
    // Avoid copies where possible:
    // - Buffer.from(Uint8Array) copies
    // - Buffer.from(ArrayBuffer, offset, length) wraps the existing memory
    if (Buffer.isBuffer(source)) {
      source = source.toString('utf8')
    } else if (ArrayBuffer.isView(source)) {
      source = Buffer.from(source.buffer, source.byteOffset, source.byteLength).toString('utf8')
    } else {
      source = Buffer.from(source).toString('utf8')
    }
  }

  if (!source) {
    if (format === 'builtin') {
      // Builtins don't give us the source property, so we're stuck
      // just requiring it to get the exports.
      return { exportNames: getExportsForNodeBuiltIn(url) }
    }

    // Sometimes source is retrieved by parentLoad, CommonJs isn't.
    source = readFileSync(fileURLToPath(url), 'utf8')
  }

  try {
    let moduleFormat = format
    if (format === 'module-typescript') {
      moduleFormat = 'module'
    } else if (format === 'commonjs-typescript') {
      stripTypeScriptTypes ??= process.getBuiltinModule?.('module')?.stripTypeScriptTypes
      if (stripTypeScriptTypes !== undefined) {
        source = stripTypeScriptTypes(source, { mode: 'strip' })
      }
      moduleFormat = 'commonjs'
    }

    if (moduleFormat === 'commonjs') {
      return yield * getCjsExports(url, context, source)
    }

    const { exportNames, starReexports, hasModuleSyntax } = lexEsm(source, url)
    const moduleExports = starReexports === undefined ? { exportNames } : { exportNames, starReexports }

    if (moduleFormat === 'module') {
      esmExportsCache.set(url, moduleExports)
      return moduleExports
    }

    // At this point our `format` is either undefined or not known by us. When
    // there are no exports and no ESM syntax, fall back to CommonJS detection.
    // Strong evidence of ESM (static import/import.meta) keeps the empty ESM
    // export set rather than incorrectly treating the module as CJS.
    if (exportNames.length === 0 && !hasModuleSyntax) {
      return yield * getCjsExports(url, context, source)
    }
    esmExportsCache.set(url, moduleExports)
    return moduleExports
  } catch (cause) {
    const err = new Error(`Failed to parse '${url}'`)
    err.cause = cause
    throw err
  }
}
