'use strict'

const getEsmExports = require('./get-esm-exports.js')
const { parse: getCjsExports } = require('cjs-module-lexer')
const fs = require('fs')
const { fileURLToPath, pathToFileURL } = require('url')

function addDefault (arr) {
  return Array.from(new Set(['default', ...arr]))
}

const urlsBeingProcessed = new Set() // Guard against circular imports.

async function getFullCjsExports (url, context, parentLoad, source) {
  if (urlsBeingProcessed.has(url)) {
    return []
  }
  urlsBeingProcessed.add(url)

  const ex = getCjsExports(source)
  const full = Array.from(new Set([
    ...addDefault(ex.exports),
    ...(await Promise.all(ex.reexports.map(re => getExports(({
      url: (/^(..?($|\/|\\))/).test(re)
        ? pathToFileURL(require.resolve(fileURLToPath(new URL(re, url)))).toString()
        : pathToFileURL(require.resolve(re)).toString(),
      context,
      parentLoad
    }))))).flat()
  ]))

  urlsBeingProcessed.delete(url)
  return full
}

/**
 * Inspects a module for its type (commonjs or module), attempts to get the
 * source code for said module from the loader API, and parses the result
 * for the entities exported from that module.
 *
 * @param {object} params
 * @param {string} params.url A file URL string pointing to the module that
 * we should get the exports of.
 * @param {object} params.context Context object as provided by the `load`
 * hook from the loaders API.
 * @param {Function} params.parentLoad Next hook function in the loaders API
 * hook chain.
 * @param {string} [defaultAs='default'] When anything other than 'default',
 * will trigger remapping of default exports in ESM source files to the
 * provided name. For example, if a submodule has `export default foo` and
 * 'myFoo' is provided for this parameter, the export line will be rewritten
 * to `rename foo as myFoo`. This is key to being able to support
 * `export * from 'something'` exports.
 *
 * @returns {Promise<string[]>} An array of identifiers exported by the module.
 * Please see {@link getEsmExports} for caveats on special identifiers that may
 * be included in the result set.
 */
async function getExports ({ url, context, parentLoad, defaultAs = 'default' }) {
  // `parentLoad` gives us the possibility of getting the source
  // from an upstream loader. This doesn't always work though,
  // so later on we fall back to reading it from disk.
  const parentCtx = await parentLoad(url, context)
  let source = parentCtx.source
  const format = parentCtx.format

  // TODO support non-node/file urls somehow?
  if (format === 'builtin') {
    // Builtins don't give us the source property, so we're stuck
    // just requiring it to get the exports.
    return addDefault(Object.keys(require(url)))
  }

  if (!source) {
    // Sometimes source is retrieved by parentLoad, sometimes it isn't.
    source = fs.readFileSync(fileURLToPath(url), 'utf8')
  }

  if (format === 'module') {
    return getEsmExports({ moduleSource: source, defaultAs })
  }
  if (format === 'commonjs') {
    return getFullCjsExports(url, context, parentLoad, source)
  }

  // At this point our `format` is either undefined or not known by us. Fall
  // back to parsing as ESM/CJS.
  const esmExports = getEsmExports({ moduleSource: source, defaultAs })
  if (!esmExports.length) {
    // TODO(bengl) it's might be possible to get here if somehow the format
    // isn't set at first and yet we have an ESM module with no exports.
    // I couldn't construct an example that would do this, so maybe it's
    // impossible?
    return getFullCjsExports(url, context, parentLoad, source)
  }
}

module.exports = getExports
