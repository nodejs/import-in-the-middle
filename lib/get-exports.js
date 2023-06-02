'use strict'

const getEsmExports = require('./get-esm-exports.js')
const { parse: getCjsExports } = require('cjs-module-lexer')
const fs = require('fs')
const { fileURLToPath } = require('url')

function addDefault(arr) {
  return Array.from(new Set(['default', ...arr]))
}

async function getExports (url, context, parentLoad) {
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
    return getEsmExports(source)
  }
  if (format === 'commonjs') {
    return addDefault(getCjsExports(source).exports)
  }

  // At this point our `format` is either undefined or not known by us. Fall
  // back to parsing as ESM/CJS.
  const esmExports = getEsmExports(source)
  if (!esmExports.length) {
    // TODO(bengl) it's might be possible to get here if somehow the format
    // isn't set at first and yet we have an ESM module with no exports.
    // I couldn't construct an example that would do this, so maybe it's
    // impossible?
    return addDefault(getCjsExports(source).exports)
  }
}

module.exports = getExports
