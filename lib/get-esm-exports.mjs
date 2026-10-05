'use strict'

import { parse } from 'es-module-lexer'

/**
 * @typedef {object} LexedExports
 * @property {string[] | Set<string>} exportNames
 * @property {Array<{ specifier: string, parentURL: string }> | undefined} starReexports
 * @property {boolean} [hasModuleImports] Whether a static import can refer to a user module.
 * @property {boolean} hasModuleSyntax
 */

/**
 * Decodes an exported identifier the way the JS engine would. es-module-lexer
 * leaves Unicode escapes in bare identifier exports (`export const \u0061 = 1`)
 * as their raw spelling, while the module namespace exposes the cooked name
 * (`a`). Quoted export names are already decoded by the lexer and start with a
 * quote in the source, so the cheap quote check keeps them on the fast path;
 * only a bare identifier carrying a backslash needs cooking. A malformed escape
 * falls back to the raw name rather than throwing inside the loader.
 *
 * @param {string} name The export name as reported by the lexer.
 * @returns {string} The cooked export name.
 */
function decodeExportName (name) {
  const first = name.charCodeAt(0)
  if (first === 0x22 /* " */ || first === 0x27 /* ' */ || !name.includes('\\')) {
    return name
  }
  try {
    return JSON.parse(`"${name}"`)
  } catch {
    return name
  }
}

/**
 * Lexes ESM source code with es-module-lexer and builds a list of exported
 * identifiers. Bare star re-exports retain the legacy `* from <specifier>`
 * representation expected by callers of this compatibility entry point.
 *
 * @param {string} moduleSource The source code of the module to lex.
 * @returns {Set<string>} The identifiers exported by the module along with any
 * custom directives.
 */
export default function getEsmExports (moduleSource) {
  return lexEsm(moduleSource).exportNames
}

/**
 * Lexes ESM source code once and reports both the exported identifiers and
 * whether the source uses ESM syntax. Sharing a single `parse` lets the
 * unknown-format path in `getModuleExports` decide between ESM and CommonJS without a
 * second pass over the source.
 *
 * `hasModuleSyntax` is es-module-lexer's own signal: static `import`/`export`
 * and `import.meta` set it, while a lone dynamic `import(...)` (valid in CJS)
 * does not.
 *
 * @param {string} moduleSource The source code of the module to lex.
 * @param {string} [parentURL] The URL of the module declaring star re-exports.
 * @param {boolean} [includeModuleImports = false] Report non-builtin static imports for cycle detection.
 * @returns {LexedExports}
 */
export function lexEsm (moduleSource, parentURL, includeModuleImports = false) {
  const legacy = parentURL === undefined
  const exportNames = legacy ? new Set() : []
  // TypeScript overload signatures and declaration merging (`function` +
  // `namespace`) make the lexer report the same name more than once. The
  // wrapper would then emit a duplicate export, which is a SyntaxError.
  let seenNames
  let starReexports
  const [imports, exports, , hasModuleSyntax] = parse(moduleSource)
  let hasModuleImports = false
  if (includeModuleImports) {
    for (const imported of imports) {
      if (isStaticImport(imported, moduleSource) && !imported.specifier.startsWith('node:')) {
        hasModuleImports = true
        break
      }
    }
  }

  for (const exported of exports) {
    if (exported.typeOnly) continue

    if (exported.type === 'reexport-all') {
      if (legacy) {
        exportNames.add(`* from ${exported.from}`)
      } else {
        (starReexports ??= []).push({ specifier: exported.from, parentURL })
      }
    } else {
      const name = decodeExportName(exported.name)
      if (legacy) {
        exportNames.add(name)
      } else {
        seenNames ??= new Set()
        if (seenNames.has(name)) continue
        seenNames.add(name)
        exportNames.push(name)
      }
    }
  }

  return includeModuleImports
    ? { exportNames, starReexports, hasModuleSyntax, hasModuleImports }
    : { exportNames, starReexports, hasModuleSyntax }
}

/**
 * @param {ReturnType<typeof parse>[0][number]} imported
 * @param {string} source
 */
function isStaticImport (imported, source) {
  return imported.type === 'static' && !imported.typeOnly && source.charCodeAt(imported.importStart) === 105
}

/** @param {import('node:module').LoadFnOutput['source']} source */
export function sourceToString (source) {
  if (source == null || typeof source === 'string') return source
  if (Buffer.isBuffer(source)) return source.toString('utf8')
  return ArrayBuffer.isView(source)
    ? Buffer.from(source.buffer, source.byteOffset, source.byteLength).toString('utf8')
    : Buffer.from(source).toString('utf8')
}

/** @typedef {false | string | Set<string> | Map<string, string | Set<string>>} StaticImports */

/**
 * @param {Record<string, string> | ReadonlyArray<readonly [string, string]> | null | undefined} attributes
 * @param {'source' | 'defer' | null} phase
 */
function getModuleRequestKey (attributes, phase) {
  let key = phase === null ? '' : `${phase};`
  if (attributes == null) return key
  if (Array.isArray(attributes)) attributes = Object.fromEntries(attributes)
  for (const name of Object.keys(attributes).sort()) {
    key += `${JSON.stringify(name)}:${JSON.stringify(attributes[name])},`
  }
  return key
}

const trivia = /\s+|\/\*[\s\S]*?\*\/|\/\/[^\r\n\u2028\u2029]*/y
const lineTerminator = /[\r\n\u2028\u2029]/

/**
 * @param {string} source
 * @param {number} position
 */
function skipTrivia (source, position) {
  while (true) {
    trivia.lastIndex = position
    if (trivia.exec(source) === null) return position
    position = trivia.lastIndex
  }
}

/** @param {string} source */
function parseStaticImports (source) {
  const imports = parse(source)[0]
  if (!source.includes('with') && !source.includes('assert')) return imports
  let normalized = source
  for (const imported of imports) {
    if (imported.type !== 'static' && imported.type !== 'reexport-star') continue
    if (imported.attributes !== null) continue
    const start = skipTrivia(source, imported.importEnd)
    const isWith = source.slice(start, start + 4) === 'with'
    const length = isWith ? 4 : 6
    if (!isWith && (source.slice(start, start + 6) !== 'assert' ||
      lineTerminator.test(source.slice(imported.importEnd, start)))) continue
    const attributesStart = skipTrivia(source, start + length)
    if (source.charCodeAt(attributesStart) !== 123) continue
    // Preserve offsets while adapting syntax that the lexer does not recognize.
    normalized = normalized.slice(0, imported.importEnd) + ' '.repeat(start - imported.importEnd) +
      'with' + ' '.repeat(attributesStart - start - 4) + normalized.slice(attributesStart)
  }
  return normalized === source ? imports : parse(normalized)[0]
}

/** @param {import('node:module').LoadFnOutput['source']} source */
export function getStaticImportCount (source) {
  source = sourceToString(source)
  if (source == null || (source.indexOf('import') === -1 && source.indexOf('from') === -1)) return 0
  /** @type {StaticImports} */
  let staticImports = false
  for (const imported of parseStaticImports(source)) {
    if ((imported.type !== 'static' && imported.type !== 'reexport-star') || imported.typeOnly) continue
    const { specifier, attributes, phase } = imported
    if ((attributes?.length || phase !== null) && !(staticImports instanceof Map)) {
      const requests = new Map()
      if (typeof staticImports === 'string') {
        requests.set(staticImports, '')
      } else if (staticImports !== false) {
        for (const previous of staticImports) requests.set(previous, '')
      }
      staticImports = requests
    }
    if (staticImports instanceof Map) {
      const key = getModuleRequestKey(attributes, phase)
      const previous = staticImports.get(specifier)
      if (previous === undefined) {
        staticImports.set(specifier, key)
      } else if (typeof previous === 'string') {
        if (previous !== key) {
          const keys = new Set()
          keys.add(previous)
          keys.add(key)
          staticImports.set(specifier, keys)
        }
      } else {
        previous.add(key)
      }
    } else if (staticImports === false) {
      staticImports = specifier
    } else if (typeof staticImports === 'string') {
      if (staticImports !== specifier) {
        const specifiers = new Set()
        specifiers.add(staticImports)
        specifiers.add(specifier)
        staticImports = specifiers
      }
    } else {
      staticImports.add(specifier)
    }
  }
  if (staticImports === false) return 0
  if (typeof staticImports === 'string') return 1
  if (!(staticImports instanceof Map)) return staticImports.size
  let count = 0
  for (const keys of staticImports.values()) count += typeof keys === 'string' ? 1 : keys.size
  return count
}
