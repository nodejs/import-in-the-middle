import { strictEqual } from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const legacy = require('iitm-legacy-v1/lib/register.js')
const count = 150_000
const base = new URL('../fixtures/legacy-replay/', import.meta.url).href

for (let i = 0; i < count; i++) {
  legacy.register(`${base}${i}.mjs`, {}, {}, {}, 'legacy-replay')
}

const { Hook } = require('../../index.js')
let replayed = 0
const hook = new Hook(() => { replayed++ })
strictEqual(replayed, count)
hook.unhook()
