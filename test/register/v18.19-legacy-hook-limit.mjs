import { strictEqual } from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { Hook: LegacyHook } = require('iitm-legacy-v3')
const legacy = require('iitm-legacy-v3/lib/register.js')
const count = 150_000
let calls = 0
const onImport = () => { calls++ }

for (let i = 0; i < count; i++) LegacyHook(onImport)

const { Hook } = require('../../index.js')
let currentCalls = 0
const hook = new Hook(() => { currentCalls++ })
legacy.register(new URL('../fixtures/legacy-hook-limit.mjs', import.meta.url).href, {}, {}, {}, 'legacy-hook-limit')
strictEqual(calls, count)
strictEqual(currentCalls, 1)
hook.unhook()
