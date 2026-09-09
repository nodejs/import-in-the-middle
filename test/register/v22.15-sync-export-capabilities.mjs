import { throws, strictEqual } from 'node:assert/strict'
import * as nodeModule from 'node:module'
import { fileURLToPath } from 'node:url'

import Hook, { addHook } from '../../index.js'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'

if (!supportsSyncHooks()) {
  process.exit(0)
}

const liveUrl = new URL('../fixtures/export-capability-live.mjs', import.meta.url)
const namedUrl = new URL('../fixtures/export-capability-named.mjs', import.meta.url)
const livePath = fileURLToPath(liveUrl)
const namedPath = fileURLToPath(namedUrl)
let successfulHookCalls = 0

process.env.TURBOPACK = '1'
nodeModule.registerHooks({
  resolve (specifier, context, nextResolve) {
    return nextResolve(specifier === 'c8-reviewhash' ? 'c8/index.js' : specifier, context)
  }
})

register({ include: [liveUrl.href, namedUrl.href, 'c8-reviewhash', 'date-fns'] })

// eslint-disable-next-line no-new
new Hook([livePath, namedPath], { replaceExports: [] }, namespace => {
  successfulHookCalls++
  if ('hookCount' in namespace.state) {
    namespace.state.hookCount++
  } else {
    namespace.state.hooked = true
  }
})

// eslint-disable-next-line no-new
new Hook(['c8'], { replaceExports: [] }, namespace => {
  strictEqual(typeof namespace.Report, 'function')
  throws(() => { namespace.Report = undefined }, { name: 'TypeError' })
})

// The Turbopack normalization of date-fns is date, but the resolved package is still date-fns.
// eslint-disable-next-line no-new
new Hook(['date'], () => {
  throw new Error('The date hook must not run for date-fns')
})

// eslint-disable-next-line no-new
new Hook(['date-fns'], { replaceExports: [] }, namespace => {
  strictEqual(typeof namespace.addDays, 'function')
  throws(() => { namespace.addDays = undefined }, { name: 'TypeError' })
})

const live = await import('../fixtures/export-capability-live-consumer.mjs')
strictEqual(live.Sub.name, 'Sub')
strictEqual(live.state.hookCount, 1)

throws(() => {
  // eslint-disable-next-line no-new
  new Hook([livePath, namedPath], { replaceExports: [] }, () => {
    throw new Error('high-level replay failed')
  })
}, { message: 'high-level replay failed' })
throws(() => addHook(() => {
  throw new Error('low-level replay failed')
}), { message: 'low-level replay failed' })

const named = await import(namedUrl)
strictEqual(named.state.hooked, true)
strictEqual(successfulHookCalls, 2)

const c8 = await import('c8-reviewhash')
strictEqual(typeof c8.Report, 'function')

const dateFns = await import('date-fns')
strictEqual(typeof dateFns.addDays, 'function')
