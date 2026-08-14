/**
 * Options for {@link register}. `include`/`exclude` accept bare specifiers,
 * `file:` URLs or regular expressions, matched against the module being
 * resolved. CJS source stripping remains enabled unless explicitly disabled.
 */
export type RegisterHooksOptions = {
  include?: Array<string | RegExp>
  exclude?: Array<string | RegExp>
  disableCjsSourceStripping?: boolean
}

/**
 * Registers `import-in-the-middle` as a *synchronous*, in-thread loader hook via
 * [`module.registerHooks()`](https://nodejs.org/api/module.html#moduleregisterhooksoptions).
 *
 * Unlike `module.register('import-in-the-middle/hook.mjs', ...)`, which runs the
 * loader on a separate thread and pays an IPC round-trip per resolved module,
 * synchronous hooks run on the application thread, so `Hook()` registrations are
 * visible to the loader directly and no acknowledgement step is required.
 *
 * Requires a Node.js version where {@link supportsSyncHooks} is `true`
 * (>= 22.22.3, >= 24.11.1, >= 25.1.0, or >= 26.0.0).
 *
 * ```ts
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
 * @throws If {@link supportsSyncHooks} is `false` in the running Node.js.
 */
export declare function register(options?: RegisterHooksOptions): void

/**
 * Whether the running Node.js can correctly run the synchronous loader via
 * `module.registerHooks()`. `false` on versions that ship `module.registerHooks()`
 * but predate the nullish-CommonJS-`source` fix (nodejs/node#59929); branch on it
 * to fall back to the asynchronous `module.register()` loader.
 */
export declare function supportsSyncHooks(): boolean
