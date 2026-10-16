import { deepStrictEqual, strictEqual } from 'node:assert/strict'

import { createHook } from '../../create-hook.mjs'

const hook = createHook({ url: new URL('../../hook.mjs', import.meta.url).href })
const result = { source: null, format: 'json', shortCircuit: true }
const realURL = 'file:///wrapper-source-fallback.json'
const wrapperURL = `${realURL}?iitm=true`
const invalidURL = '://iitm?value'
const bindingURL = `${realURL}?iitm=bindings`

for (const load of [hook.load, hook.loadSync]) {
  const loadedURLs = []
  /** @param {string} url The requested module URL. */
  function nextLoad (url) {
    loadedURLs.push(url)
    return result
  }

  strictEqual(await load(invalidURL, { format: 'json' }, nextLoad), result)
  strictEqual(await load(wrapperURL, { format: 'json' }, nextLoad), result)
  strictEqual(await load(bindingURL, { format: 'module' }, nextLoad), result)
  deepStrictEqual(loadedURLs, [invalidURL, wrapperURL, realURL, bindingURL])
}

for (const resolve of [hook.resolve, hook.resolveSync]) {
  const result = { url: 'node:fs', format: 'builtin' }
  /** @param {string} specifier The stripped builtin specifier. */
  function nextResolve (specifier) {
    strictEqual(specifier, 'node:fs')
    return result
  }

  strictEqual(await resolve('file:///node:fs?iitm=true', {
    parentURL: new URL('../../hook.mjs', import.meta.url).href
  }, nextResolve), result)
}
