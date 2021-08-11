/**
 * A hook function to be run against loaded modules.
 * @param {url} string The absolute path of the module, as a `file:` URL string.
 * @param {exported} { [string]: any } An object representing the exported items of a module.
 */
export type HookFunction = (url: string, exported: { [string]: any }) => void

/**
 * Adds a hook to be run on any already loaded modules and any that will be loaded in the future.
 * It will be run once per loaded module. If statically imported, any variables bound directly to
 * exported items will be re-bound if those items are re-assigned in the hook.
 * @param {HookFunction} hookFn The function to be run on each module.
 */
export declare function addHook(hookFn: HookFunction): void

/**
 * Removes a hook that has been previously added with `addHook`. It will no longer be run against
 * any subsequently loaded modules.
 * @param {HookFunction} hookFn The function to be removed.
 */
export declare function removeHook(hookFn: HookFunction): void
