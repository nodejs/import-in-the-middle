'use strict'

const getEsmExports = require('./get-esm-exports.js')

function astParse(fileContents, url) {
  return getEsmExports(fileContents, true, url)
}

module.exports = astParse