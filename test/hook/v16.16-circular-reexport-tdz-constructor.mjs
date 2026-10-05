import { strictEqual } from 'node:assert/strict'

import Hook from '../../index.js'

/** @typedef {{ callback: () => void, time: number }} Timer */
/** @type {Timer[]} */
const timers = []
const setTimeout = globalThis.setTimeout
let time = 0
/**
 * @param {() => void} callback
 * @param {number} delay
 */
globalThis.setTimeout = (callback, delay) => {
  timers.push({ callback, time: time + delay })
  return { unref () {} }
}
const hook = new Hook(() => {})
try {
  const mod = await import('../fixtures/reexport-tdz-cycle-b.mjs')
  strictEqual(mod.RunTree, undefined)
  await Promise.resolve()
  while (timers.length) {
    /**
     * @param {Timer} left
     * @param {Timer} right
     */
    timers.sort((left, right) => left.time - right.time)
    const timer = timers.shift()
    time = timer.time
    timer.callback()
  }
  strictEqual(typeof mod.RunTree, 'function')
  strictEqual(new mod.RunTree().ok, true)
  strictEqual(mod.make().ok, true)
} finally {
  globalThis.setTimeout = setTimeout
  hook.unhook()
}
