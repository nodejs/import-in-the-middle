import assert from 'node:assert/strict'
import * as module from 'node:module'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = process.env.IITM_BENCHMARK_PACKAGE_ROOT
const mode = process.env.IITM_BENCHMARK_MODE
const workload = process.env.IITM_BENCHMARK_WORKLOAD
assert.ok(root && mode && workload, 'Benchmark environment is required')
const require = module.createRequire(import.meta.url)
const active = mode.endsWith('-active') || mode.endsWith('-selective')
const target = workload === 'small' ? fileURLToPath(new URL('a.mjs', import.meta.url)) : 'date-fns'
let hooks = 0
let calls = 0

if (active) {
  const { Hook } = require(resolve(root, 'index.js'))
  Hook([target],
    /** @param {{ value: number, addDays: typeof import('date-fns').addDays }} exports */
    (exports) => {
      hooks++
      if (workload === 'small') {
        exports.value++
      } else {
        const addDays = exports.addDays
        /**
       * @param {Date} date Date to advance.
       * @param {number} amount Days to add.
       */
        exports.addDays = function (date, amount) {
          calls++
          return addDays(date, amount)
        }
      }
    })
}

if (mode !== 'none') {
  const options = mode.endsWith('-excluded')
    ? { include: [] }
    : mode.endsWith('-selective')
      ? { include: [workload === 'small' ? pathToFileURL(target).href : target] }
      : undefined
  if (mode.startsWith('sync-')) {
    const { register } = await import(pathToFileURL(resolve(root, 'register-hooks.mjs')).href)
    register(options)
  } else if (module.register) {
    module.register(pathToFileURL(resolve(root, 'hook.mjs')), { data: options })
  }
}

if (workload === 'small') {
  const { sum } = await import('./small.mjs')
  assert.equal(sum, active ? 88 : 87)
} else {
  const { addDays, isValid, parseISO } = await import('date-fns')
  const { default: Clock } = await import('./commonjs.cjs')
  const date = parseISO('2026-09-09T00:00:00Z')
  assert.equal(isValid(date), true)
  assert.equal(new Clock().copy(addDays(date, 1)).getUTCDate(), 10)
  assert.equal(calls, active ? 1 : 0)
}
assert.equal(hooks, active ? 1 : 0)
const cpu = process.cpuUsage()
process.stdout.write(`${JSON.stringify({ wallMs: performance.now(), cpuMs: (cpu.user + cpu.system) / 1000 })}\n`)
