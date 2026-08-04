'use strict'

const getNodeModuleFormat = require('./lib/get-node-module-format.js')

/** @type {typeof import('./bundler.mjs').createWrapperModule|undefined} */
let createWrapperModuleImplementation

/**
 * @param {Parameters<typeof import('./bundler.mjs').createWrapperModule>[0]} options
 */
async function createWrapperModule (options) {
  createWrapperModuleImplementation ??= (await import('./bundler.mjs')).createWrapperModule
  return createWrapperModuleImplementation(options)
}

exports.createWrapperModule = createWrapperModule
exports.getNodeModuleFormat = getNodeModuleFormat
