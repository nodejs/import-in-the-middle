import * as module from 'module'
import { createHook } from './create-hook.mjs'
import { supportsSyncHooks } from './supports-sync-hooks.mjs'

export { supportsSyncHooks }

const hook = createHook(import.meta)

let registered = false

/**
 * Registers `import-in-the-middle` as a *synchronous*, in-thread loader hook via
 * [`module.registerHooks()`](https://nodejs.org/api/module.html#moduleregisterhooksoptions).
 *
 * Unlike `module.register('import-in-the-middle/hook.mjs', ...)`, which runs the
 * loader on a separate thread and pays an IPC round-trip per resolved module,
 * synchronous hooks run in the application thread. There is no message channel
 * to bridge, so `Hook()` registrations from the main `import-in-the-middle`
 * entry point are visible to the loader directly and no acknowledgement step is
 * required.
 *
 * Requires a Node.js version whose `module.registerHooks` accepts the nullish
 * CommonJS source the loader relies on: >= 22.22.3, >= 24.11.1, >= 25.1.0, or
 * >= 26.0.0 (see `supportsSyncHooks`). Use that predicate to fall back to the
 * asynchronous `module.register` loader on unsupported versions.
 *
 * ```js
 * import { register } from 'import-in-the-middle/register-hooks.mjs'
 * import { Hook } from 'import-in-the-middle'
 *
 * register({ include: ['package-i-want-to-include'] })
 *
 * Hook(['package-i-want-to-include'], (exported, name, baseDir) => {
 *   // Instrument the module
 * })
 * ```
 *
 * @param {object} [options]
 * @param {Array<string|RegExp>} [options.include] Only intercept these modules.
 * @param {Array<string|RegExp>} [options.exclude] Never intercept these modules.
 * @param {boolean} [options.disableCjsSourceStripping] Leave hook-provided CJS source unchanged.
 * @returns {void}
 */
export function register (options) {
  if (!supportsSyncHooks()) {
    throw new Error(
      "'import-in-the-middle' synchronous hooks require a Node.js version whose " +
      'module.registerHooks accepts nullish CommonJS source ' +
      '(>= 22.22.3, >= 24.11.1, >= 25.1.0, or >= 26.0.0); ' +
      'see https://github.com/nodejs/node/pull/59929'
    )
  }

  if (registered) {
    process.emitWarning("'import-in-the-middle' synchronous hooks have already been registered")
    return
  }
  registered = true

  if (options) {
    hook.applyOptions(options)
  }

  module.registerHooks({ resolve: hook.resolveSync, load: hook.loadSync })
}
