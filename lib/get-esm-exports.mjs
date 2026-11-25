'use strict'

import { parse } from 'es-module-lexer'

/** @typedef {string | Pick<import('es-module-lexer').StaticImport, 'specifier' | 'attributes'>} ModuleImport */
/** @typedef {{ specifier: string, parentURL: string, attributes?: ReadonlyArray<readonly [string, string]> }} StarReexport */
/** @typedef {StarReexport & { importName: string }} NamedReexport */

/**
 * @typedef {object} LexedExports
 * @property {string[] | Set<string>} exportNames
 * @property {StarReexport[] | undefined} starReexports
 * @property {boolean} [hasModuleImports] Whether a non-star static request can refer to a user module.
 * @property {ModuleImport[] | undefined} [moduleImports]
 * @property {boolean} hasModuleSyntax
 * @property {Map<string, string | NamedReexport>} [exportAliases]
 * @property {boolean} [hasNamedReexports]
 */

/**
 * Decodes an exported identifier the way the JS engine would. es-module-lexer
 * leaves Unicode escapes in bare identifier exports (`export const \u0061 = 1`)
 * as their raw spelling, while the module namespace exposes the cooked name
 * (`a`). Quoted export names are already decoded by the lexer and start with a
 * quote in the source. Only decode backslashes in unquoted names.
 *
 * @param {string} name The export name as reported by the lexer.
 * @param {string} source The original source.
 * @param {number} start The start of the name in the source.
 * @returns {string} The cooked export name.
 */
function decodeExportName (name, source, start) {
  if (!name.includes('\\')) return name
  const first = source.charCodeAt(start)
  if (first === 0x22 || first === 0x27) return name
  return name.replace(/\\u(?:([\da-fA-F]{4})|\{([\da-fA-F]+)\})/g, (raw, fixed, braced) => {
    const point = Number.parseInt(fixed ?? braced, 16)
    return point <= 0x10FFFF ? String.fromCodePoint(point) : raw
  })
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
 * @param {boolean} [retainRequests = false] Keep re-export attributes and binding aliases.
 * @returns {LexedExports}
 */
export function lexEsm (moduleSource, parentURL, includeModuleImports = false, retainRequests = false) {
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
  let exportAliases
  let hasNamedReexports = false
  if (includeModuleImports) {
    for (const imported of imports) {
      if ((imported.type !== 'static' && imported.type !== 'reexport-star') ||
          imported.typeOnly || imported.specifier.startsWith('node:')) continue
      moduleImports ??= []
      if (imported.attributes === null) {
        moduleImports.push(imported.specifier)
      } else {
        moduleImports.push({ specifier: imported.specifier, attributes: imported.attributes })
      }
      if (imported.type === 'static') hasModuleImports = true
    }
  }

  for (const exported of exports) {
    if (exported.typeOnly) continue

    if (exported.type === 'reexport-all') {
      if (legacy) {
        exportNames.add(`* from ${exported.from}`)
      } else {
        starReexports ??= []
        const reexport = { specifier: exported.from, parentURL }
        if (retainRequests) {
          const attributes = imports[exported.importIndex].attributes
          if (attributes !== null) reexport.attributes = attributes
        }
        starReexports.push(reexport)
      }
    } else {
      const name = decodeExportName(exported.name, moduleSource, exported.start)
      if (legacy) {
        exportNames.add(name)
      } else {
        seenNames ??= new Set()
        if (seenNames.has(name)) continue
        seenNames.add(name)
        exportNames.push(name)
        if (retainRequests) {
          if (exported.type === 'direct') {
            const local = exported.localName
            if (local !== undefined && local !== name) {
              exportAliases ??= new Map()
              exportAliases.set(name, decodeExportName(local, moduleSource, exported.localStart))
            }
          } else {
            const { importStart, attributes } = imports[exported.importIndex]
            if (exported.importName !== null) {
              const importName = decodeExportName(exported.importName, moduleSource, exported.importNameStart)
              const reexport = { specifier: exported.from, parentURL, importName }
              if (attributes !== null) reexport.attributes = attributes
              exportAliases ??= new Map()
              exportAliases.set(name, reexport)
              hasNamedReexports = true
            } else if (importStart !== exported.exportStart) {
              exportAliases ??= new Map()
              exportAliases.set(name, `namespace-import:${importStart}`)
            }
          }
        }
      }
    }
  }

  if (includeModuleImports) {
    return { exportNames, starReexports, hasModuleSyntax, hasModuleImports, moduleImports }
  }
  if (exportAliases !== undefined) {
    return { exportNames, starReexports, hasModuleSyntax, exportAliases, hasNamedReexports }
  }
  return { exportNames, starReexports, hasModuleSyntax }
}

/** @param {import('node:module').LoadFnOutput['source']} source */
export function sourceToString (source) {
  if (source == null || typeof source === 'string') return source
  if (Buffer.isBuffer(source)) return source.toString('utf8')
  if (ArrayBuffer.isView(source)) {
    return Buffer.from(source.buffer, source.byteOffset, source.byteLength).toString('utf8')
  }
  return Buffer.from(source).toString('utf8')
}
