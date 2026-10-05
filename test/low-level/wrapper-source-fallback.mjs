import { deepStrictEqual, strictEqual } from 'node:assert/strict'

import { createHook } from '../../create-hook.mjs'

const hook = createHook({ url: new URL('../../hook.mjs', import.meta.url).href })
const result = { source: null, format: 'json', shortCircuit: true }
const realURL = 'file:///wrapper-source-fallback.json'
const wrapperURL = `${realURL}?iitm=true`
const invalidURL = '://iitm'

for (const load of [hook.load, hook.loadSync]) {
  const loadedURLs = []
  /** @param {string} url The requested module URL. */
  function nextLoad (url) {
    loadedURLs.push(url)
    return result
  }

  strictEqual(await load(invalidURL, { format: 'json' }, nextLoad), result)
  strictEqual(await load(wrapperURL, { format: 'json' }, nextLoad), result)
  deepStrictEqual(loadedURLs, [invalidURL, wrapperURL, realURL])
}
