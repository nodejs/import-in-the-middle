'use strict'

const getEsmExports = require('./get-esm-exports.js')
const { parse: getCjsExports }= require('cjs-module-lexer')
const fs = require('fs')

function addDefault(arr) {
  return Array.from(new Set(['default', ...arr]))
}
function getExports (url, format) {
  // TODO support non-node/file urls somehow
  if (format === 'builtin') {
    return addDefault(Object.keys(require(url)))
  }

  const source = fs.readFileSync(new URL(url).pathname, 'utf8')

  if (format === 'module') {
    return getEsmExports(source)
  }
  if (format === 'commonjs') {
    return addDefault(getCjsExports(source).exports)
  }

  const esmExports = getEsmExports(source)
  if (!esmExports.length) {
    return addDefault(getCjsExports(source).exports)
  }
}

module.exports = getExports
