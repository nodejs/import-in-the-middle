'use strict'

import { parse } from 'es-module-lexer'

/** @typedef {string | Pick<import('es-module-lexer').StaticImport, 'specifier' | 'attributes'>} ModuleImport */

/**
 * @typedef {object} LexedExports
 * @property {string[] | Set<string>} exportNames
 * @property {Array<{ specifier: string, parentURL: string }> | undefined} starReexports
 * @property {boolean} [hasModuleImports] Whether a non-star static request can refer to a user module.
 * @property {ModuleImport[] | undefined} [moduleImports]
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
 * @param {boolean} [includeModuleImports = false] Report static requests and possible cycle importers.
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
  let moduleImports
  if (includeModuleImports) {
    for (const imported of imports) {
      if ((imported.type !== 'static' && imported.type !== 'reexport-star') ||
          imported.typeOnly || imported.specifier.startsWith('node:')) continue
      ;(moduleImports ??= []).push(imported.attributes === null
        ? imported.specifier
        : { specifier: imported.specifier, attributes: imported.attributes })
      if (imported.type === 'static') hasModuleImports = true
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
    ? { exportNames, starReexports, hasModuleSyntax, hasModuleImports, moduleImports }
    : { exportNames, starReexports, hasModuleSyntax }
}

/** @param {import('node:module').LoadFnOutput['source']} source */
export function sourceToString (source) {
  if (source == null || typeof source === 'string') return source
  if (Buffer.isBuffer(source)) return source.toString('utf8')
  return ArrayBuffer.isView(source)
    ? Buffer.from(source.buffer, source.byteOffset, source.byteLength).toString('utf8')
    : Buffer.from(source).toString('utf8')
}
