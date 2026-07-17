import * as nodeModule from 'node:module'

import { createHook } from './inspectable-create-hook.mjs'

const meta = { url: new URL('../../register-hooks.mjs', import.meta.url).href }
const { applyOptions, loadSync, resolveSync, specifiers } = createHook(meta)

applyOptions({ exclude: [/^node:(path|url)/] })

process.once('exit', () => {
  if (specifiers.size !== 0) {
    // eslint-disable-next-line no-console
    console.error(`synchronous specifiers map leak detected: ${Array.from(specifiers.keys()).join(', ')}`)
    process.exitCode = 1
  }
})

nodeModule.registerHooks({ resolve: resolveSync, load: loadSync })
