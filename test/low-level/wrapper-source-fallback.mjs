import { deepStrictEqual, strictEqual } from 'node:assert/strict'

import { createHook } from '../../create-hook.mjs'

const hookURL = new URL('../../hook.mjs', import.meta.url).href
const hook = createHook({ url: hookURL })
const result = { source: null, format: 'json', shortCircuit: true }
const realURL = 'file:///wrapper-source-fallback.json'
const wrapperURL = `${realURL}?iitm=true`
const invalidURL = '://invalid?iitm=true'

for (const load of [hook.load, hook.loadSync]) {
  const loadedURLs = []
  /** @param {string} url */
  function nextLoad (url) {
    loadedURLs.push(url)
    return result
  }

  strictEqual(await load(invalidURL, { format: 'json' }, nextLoad), result)
  strictEqual(await load(wrapperURL, { format: 'json' }, nextLoad), result)
  deepStrictEqual(loadedURLs, [invalidURL, wrapperURL, realURL])
}

for (const resolve of [hook.resolve, hook.resolveSync]) {
  const result = { url: 'node:fs', format: 'builtin' }
  /** @param {string} specifier */
  function nextResolve (specifier) {
    strictEqual(specifier, 'node:fs')
    return result
  }

  strictEqual(await resolve('file:///node:fs?iitm=true', {
    parentURL: hookURL
  }, nextResolve), result)
}
