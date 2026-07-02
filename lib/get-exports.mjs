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

// Resolve `stripTypeScriptTypes` (Node >= 22.13) via `getBuiltinModule` rather
// than a static named import (throws on older runtimes) or `require` (re-enters
// iitm's own loader hooks). `undefined` on runtimes that lack it.
const stripTypeScriptTypes = process.getBuiltinModule?.('module')?.stripTypeScriptTypes

let parserInitialized = false

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

function addDefault (arr) {
  return new Set(['default', ...arr])
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
    exports = new Set(addDefault(Object.getOwnPropertyNames(loadBuiltin(name))))
    // added in node 23 as alias for default in cjs modules
    if (hasModuleExportsCJSDefault) {
      exports.add('module.exports')
    }
    BUILT_INS.set(name, exports)
  }

  return exports
}

const urlsBeingProcessed = new Set() // Guard against circular imports.

// Memoizes ESM modules by URL. A leaf reached from several barrels (`export *`)
// would otherwise be read and lexed once per barrel; its export set is intrinsic
// to the file and stable for the process, so the first lex serves the rest. Only
// the pure ESM result is cached: the CommonJS path mutates `context.format` and
// resolves re-exports, and builtins already memoize via BUILT_INS, so both keep
// their existing per-call behavior.
//
// The same entry also carries the source the export pass read, so the wrapper's
// `import * as namespace from <realUrl>` is served from it (see
// `takeCachedSource`) instead of reading the file a second time. `source` is
// held only until that import consumes it; `exportNames` stays for later barrels.
const esmExportsCache = new Map()

/**
 * Returns and releases the source the export pass read for `url`, for the
 * wrapper's own `import * as namespace from <realUrl>`. The source is dropped
 * from the cache on the first read so the string is not retained past the one
 * import that needs it; the export-names memo stays. Returns `undefined` when
 * nothing was cached (non-ESM, no usable format) or it was already consumed.
 *
 * Source is cached only for `module` / `module-typescript`: a wrapped CJS
 * module's real load goes through the `cjsInIitmChain` branch, which must return
 * `source: undefined` (else `require()` of a "module-sync" package fails with
 * ERR_VM_MODULE_LINK_FAILURE), and a load without a usable format relies on Node
 * to resolve it, which serving a cached entry would short-circuit into
 * ERR_UNKNOWN_MODULE_FORMAT.
 *
 * @param {string} url The real (non-iitm) module URL.
 * @returns {{ source: string, format: string } | undefined}
 */
export function takeCachedSource (url) {
  const entry = esmExportsCache.get(url)
  if (entry?.source === undefined) {
    return undefined
  }
  const { source, format } = entry
  entry.source = undefined
  return { source, format }
}

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

function * getCjsExports (url, context, source) {
  if (urlsBeingProcessed.has(url)) {
    return new Set()
  }
  urlsBeingProcessed.add(url)

  try {
    ensureParserInitialized()
    const result = parseCjs(source)
    const full = addDefault(result.exports)

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

      for (const each of yield * getExports(newUrl, context)) {
        full.add(each)
      }
    }

    // added in node 23 as alias for default in cjs modules
    if (full.has('default') && hasModuleExportsCJSDefault) {
      full.add('module.exports')
    }

    // we know that it's commonjs at this point, because ESM failed
    context.format = 'commonjs'
    return full
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
 * @returns {Generator<Array, Set<string>>} A generator that yields I/O
 * operations and ultimately returns the identifiers exported by the module.
 * Please see {@link getEsmExports} for caveats on special identifiers that may
 * be included in the result set.
 */
export function * getExports (url, context) {
  const cached = esmExportsCache.get(url)
  if (cached !== undefined) {
    return cached.exportNames
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
      return getExportsForNodeBuiltIn(url)
    }

    // Sometimes source is retrieved by parentLoad, CommonJs isn't.
    source = readFileSync(fileURLToPath(url), 'utf8')
  }

  try {
    // The wrapper's namespace import is served this exact source, so keep it
    // before type-stripping: Node strips again on the real load and only
    // `module` / `module-typescript` are served (see `takeCachedSource`).
    const importSource = (format === 'module' || format === 'module-typescript')
      ? source
      : undefined

    // Node hands the load hook the original TypeScript source, so strip the
    // types before the JS parsers run, then treat the module as the JS it
    // compiles to. Early type-stripping releases tag the format but lack the
    // API; the un-stripped parse then fails cleanly into onWrapFailure.
    let moduleFormat = format
    if (format === 'module-typescript' || format === 'commonjs-typescript') {
      if (stripTypeScriptTypes !== undefined) {
        source = stripTypeScriptTypes(source, { mode: 'strip' })
      }
      moduleFormat = format === 'module-typescript' ? 'module' : 'commonjs'
    }

    if (moduleFormat === 'commonjs') {
      return yield * getCjsExports(url, context, source)
    }

    const { exportNames, hasModuleSyntax } = lexEsm(source)

    if (moduleFormat === 'module') {
      esmExportsCache.set(url, { exportNames, source: importSource, format })
      return exportNames
    }

    // At this point our `format` is either undefined or not known by us. When
    // there are no exports and no ESM syntax, fall back to CommonJS detection.
    // Strong evidence of ESM (static import/import.meta) keeps the empty ESM
    // export set rather than incorrectly treating the module as CJS.
    if (!exportNames.size && !hasModuleSyntax) {
      return yield * getCjsExports(url, context, source)
    }
    // Format is unknown here, so no source is served (importSource is
    // undefined): Node must resolve the format on the real load.
    esmExportsCache.set(url, { exportNames, source: importSource, format })
    return exportNames
  } catch (cause) {
    const err = new Error(`Failed to parse '${url}'`)
    err.cause = cause
    throw err
  }
}
