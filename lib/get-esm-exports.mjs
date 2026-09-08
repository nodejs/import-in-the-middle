'use strict'

import { parse } from 'es-module-lexer'

/**
 * @typedef {object} LexedExports
 * @property {string[] | Set<string>} exportNames
 * @property {Array<{ specifier: string, parentURL: string }> | undefined} starReexports
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
 * unknown-format path in `getExports` decide between ESM and CommonJS without a
 * second pass over the source.
 *
 * `hasModuleSyntax` is es-module-lexer's own signal: static `import`/`export`
 * and `import.meta` set it, while a lone dynamic `import(...)` (valid in CJS)
 * does not.
 *
 * @param {string} moduleSource The source code of the module to lex.
 * @param {string} [parentURL] The URL of the module declaring star re-exports.
 * @returns {LexedExports}
 */
export function lexEsm (moduleSource, parentURL) {
  const legacy = parentURL === undefined
  const exportNames = legacy ? new Set() : []
  let starReexports
  const [, exports, , hasModuleSyntax] = parse(moduleSource)

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
        exportNames.push(name)
      }
    }
  }

  return { exportNames, starReexports, hasModuleSyntax }
}
