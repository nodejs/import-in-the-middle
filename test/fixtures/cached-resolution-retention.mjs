import * as module from 'node:module'

import Hook from '../../index.js'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'

if (supportsSyncHooks()) {
  const targetURL = new URL('./specifier-string.js', import.meta.url)
  module.registerHooks({
    /**
     * @param {string} url
     * @param {import('node:module').LoadHookContext} context
     * @param {import('node:module').LoadHook} nextLoad
     */
    load (url, context, nextLoad) {
      if (!url.startsWith('data:text/javascript,retention-')) return nextLoad(url, context)
      return { format: 'module', source: `import '${targetURL}'`, shortCircuit: true }
    }
  })
  register({ include: [targetURL.href] })
  const hook = new Hook(() => {})
  await import(targetURL)
  global.gc()
  for (let index = 0; index < 1_000_000; index++) await import(targetURL)
  for (let index = 0; index < 2_000; index++) {
    await import(`data:text/javascript,retention-${index}`)
  }
  hook.unhook()
}
