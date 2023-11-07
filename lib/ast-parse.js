'use strict'

const getEsmExports = require('./get-esm-exports.js')

function astParse(fileContents) {
  return getEsmExports(fileContents, true)
}

module.exports = astParse