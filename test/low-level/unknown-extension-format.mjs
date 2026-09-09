import { deepStrictEqual, match, rejects, strictEqual, throws } from 'node:assert/strict'

import { createHook } from '../fixtures/inspectable-create-hook.mjs'

const parentURL = 'file:///app/entry.mjs'
const moduleURL = 'file:///app/node_modules/example/module.custom'
const moduleSource = 'export const value = 42'

/**
 * @returns {{ url: string }}
 */
function resolveUnknownFormat () {
  return { url: moduleURL }
}

let asyncLoads = 0

/**
 * @param {string} url
 * @returns {Promise<{ format: string, source: string }>}
 */
async function loadUnknownFormat (url) {
  strictEqual(url, moduleURL)
  asyncLoads++
  return { format: 'module', source: moduleSource }
}

const asyncHook = createHook(import.meta)
const asyncResolution = await asyncHook.resolve('example', { parentURL }, resolveUnknownFormat)
match(asyncResolution.url, /[?&]iitm=true/)
const asyncResult = await asyncHook.load(asyncResolution.url, {}, loadUnknownFormat)
match(asyncResult.source, /register/)
strictEqual(asyncLoads, 1)
strictEqual(asyncHook.specifiers.size, 0)

let syncLoads = 0

/**
 * @param {string} url
 * @returns {{ format: string, source: string }}
 */
function loadUnknownFormatSync (url) {
  strictEqual(url, moduleURL)
  syncLoads++
  return { format: 'module', source: moduleSource }
}

const syncHook = createHook(import.meta)
const syncResolution = syncHook.resolveSync('example', { parentURL }, resolveUnknownFormat)
match(syncResolution.url, /[?&]iitm=true/)
const syncResult = syncHook.loadSync(syncResolution.url, {}, loadUnknownFormatSync)
match(syncResult.source, /register/)
strictEqual(syncLoads, 1)
strictEqual(syncHook.specifiers.size, 0)

const unsupportedURL = 'file:///app/node_modules/example/data.custom'
const unsupportedResult = { format: 'json', source: '{}' }

/**
 * @returns {{ url: string }}
 */
function resolveUnsupportedFormat () {
  return { url: unsupportedURL }
}

/**
 * @param {string} url
 * @returns {Promise<{ format: string, source: string }>}
 */
async function loadUnsupportedFormat (url) {
  strictEqual(url, unsupportedURL)
  return unsupportedResult
}

const unsupportedHook = createHook(import.meta)
const unsupportedResolution = await unsupportedHook.resolve('example/data', { parentURL }, resolveUnsupportedFormat)
const unsupported = await unsupportedHook.load(unsupportedResolution.url, {}, loadUnsupportedFormat)
deepStrictEqual(unsupported, unsupportedResult)
strictEqual(unsupportedHook.specifiers.size, 0)

const asyncFailureHook = createHook(import.meta)
const asyncFailureResolution = await asyncFailureHook.resolve('example', { parentURL }, resolveUnknownFormat)

async function failAsyncLoad () {
  throw new Error('async load failed')
}

await rejects(asyncFailureHook.load(asyncFailureResolution.url, {}, failAsyncLoad), {
  message: 'async load failed'
})
strictEqual(asyncFailureHook.specifiers.size, 0)

const syncFailureHook = createHook(import.meta)
const syncFailureResolution = syncFailureHook.resolveSync('example', { parentURL }, resolveUnknownFormat)

function failSyncLoad () {
  throw new Error('sync load failed')
}

throws(() => syncFailureHook.loadSync(syncFailureResolution.url, {}, failSyncLoad), {
  message: 'sync load failed'
})
strictEqual(syncFailureHook.specifiers.size, 0)
