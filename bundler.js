'use strict'

const { readFileSync } = require('node:fs')

const createGetNodeModuleFormat = require('./lib/get-node-module-format.js')

const getNodeModuleFormat = createGetNodeModuleFormat(readFileSync)

/** @type {typeof import('./bundler.mjs').createWrapperModule|undefined} */
let createWrapperModuleImplementation

/**
 * EXPERIMENTAL
 * This API is experimental and may change in minor versions.
 *
 * @param {Parameters<typeof import('./bundler.mjs').createWrapperModule>[0]} options
 */
async function createWrapperModule (options) {
  createWrapperModuleImplementation ??= (await import('./bundler.mjs')).createWrapperModule
  return createWrapperModuleImplementation(options)
}

exports.createWrapperModule = createWrapperModule

/**
 * EXPERIMENTAL
 * This API is experimental and may change in minor versions.
 */
exports.getNodeModuleFormat = getNodeModuleFormat
