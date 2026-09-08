// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

const importHooks = [] // TODO should this be a Set?
const binders = new WeakMap()
const specifiers = new Map()
const toHook = []

/**
 * @param {object} source The module namespace.
 * @param {string | symbol} name The export name.
 */
function readExport (source, name) {
  if (name === 'module.exports' && !Object.hasOwn(source, name)) {
    return source.default
  }
  return source[name]
}

/**
 * @param {object} target The proxy target.
 * @param {string | symbol} name The export name.
 * @param {unknown} value The replacement value.
 */
function setExport (target, name, value) {
  return binders.get(target).write(name, value)
}

/**
 * @param {object} target The proxy target.
 * @param {string | symbol} name The export name.
 * @param {PropertyDescriptor} descriptor The replacement descriptor.
 */
function defineExport (target, name, descriptor) {
  if (!('value' in descriptor)) {
    throw new Error('Getters/setters are not supported for exports property descriptors.')
  }
  return setExport(target, name, descriptor.value)
}

const proxyHandler = { defineProperty: defineExport, set: setExport }

/**
 * @param {string} name The wrapped module URL.
 * @param {ModuleBinder} binder The wrapper's binding state.
 * @param {string} specifier The original import specifier.
 */
function register (name, binder, specifier) {
  const { namespace } = binder
  specifiers.set(name, specifier)
  binders.set(namespace, binder)
  const proxy = new Proxy(namespace, proxyHandler)
  importHooks.forEach(hook => hook(name, proxy, specifier))
  toHook.push([name, proxy, specifier])
}

// Delays (ms) for re-reading exports that were still in their temporal dead zone
// when the wrapper first ran (circular imports). Retried on a microtask first,
// then at these intervals; unref'd so best-effort retries never hold the process
// open. Frozen once at module load rather than rebuilt per wrapper.
const RETRY_DELAYS = [0, 10, 50]

/**
 * Per-wrapped-module state a generated wrapper builds once to expose its exports
 * through iitm's proxy. Each wrapper supplies one indexed writer for all local
 * bindings; the constructor seeds them from the real module, and `flush`
 * resolves any export that was undefined (circular import) once it becomes available.
 *
 * This is the boilerplate the wrapper used to inline in full per module. Hoisting
 * it here compiles the retry and proxy bookkeeping once instead of once per
 * wrapped module.
 */
class ModuleBinder {
  // Mimics a Module namespace object (https://tc39.es/ecma262/#sec-module-namespace-objects).
  namespace = Object.create(null, { [Symbol.toStringTag]: { value: 'Module' } })
  #set = Object.create(null)
  #write
  #overridden
  #pending

  /**
   * @param {object} source The wrapped module namespace.
   * @param {string[]} [keys] Export names in wrapper-binding order.
   * @param {(index: number, value: unknown) => void} [write] Assigns a wrapper binding by index.
   * @param {object[]} [sources] Alternate namespaces for star-collision bindings.
   */
  constructor (source, keys, write, sources) {
    this.#write = write
    if (keys !== undefined) {
      for (let index = 0; index < keys.length; index++) {
        this.#bind(keys[index], index, sources?.[index] ?? source)
      }
    }
  }

  /**
   * Seeds `key` from `source` and installs its proxy accessors. A value that is
   * undefined or throws `ReferenceError` (temporal dead zone during a circular
   * import) is deferred to `flush`; any other throw propagates.
   *
   * @param {string} key The export name.
   * @param {number} index The wrapper binding index.
   * @param {object} source The binding's source namespace.
   * @returns {void}
   */
  #bind (key, index, source) {
    let value
    try {
      value = readExport(source, key)
      this.#write(index, value)
      this.namespace[key] = value
    } catch (error) {
      if (!(error instanceof ReferenceError)) throw error
    }
    if (value === undefined) {
      (this.#pending ??= []).push(this.#makeUpdater(key, index, source))
    }
    this.#set[key] = index
  }

  /**
   * @param {string | symbol} key The export name.
   * @param {unknown} value The replacement value.
   * @returns {boolean}
   */
  write (key, value) {
    const index = this.#set[key]
    if (index !== undefined) {
      this.#write(index, value)
      if (this.#pending !== undefined) {
        this.#overridden ??= Object.create(null)
        this.#overridden[key] = true
      }
      this.namespace[key] = value
    }
    return true
  }

  /**
   * @param {string} key The export name to update.
   * @param {number} index The wrapper binding index.
   * @param {object} source The real module namespace.
   * @returns {() => boolean} Updater returning whether the value is now settled.
   */
  #makeUpdater (key, index, source) {
    return () => {
      if (this.#overridden?.[key] === true) return true
      try {
        const value = readExport(source, key)
        if (value !== undefined) {
          this.#write(index, value)
          this.namespace[key] = value
          return true
        }
        return false
      } catch (error) {
        if (error instanceof ReferenceError) return false
        // Only reached if a getter starts throwing a non-ReferenceError after the
        // initial bind read already succeeded or deferred; surfaces in flush's
        // microtask. Kept as-is from the inline wrapper.
        /* c8 ignore next */
        throw error
      }
    }
  }

  #flushOnce () {
    const pending = this.#pending
    if (pending === undefined) return

    let next
    for (const updater of pending) {
      // If it still throws ReferenceError, keep it for the (single) next attempt.
      if (updater() !== true) (next ??= []).push(updater)
    }
    this.#pending = next
  }

  /**
   * Resolves exports deferred by `bind` (undefined or TDZ at wrapper-eval time).
   * Retries on a microtask, then at `RETRY_DELAYS`, giving up afterwards to avoid
   * unbounded retries. A no-op when nothing was deferred.
   *
   * @returns {void}
   */
  flush () {
    if (this.#pending === undefined) return
    queueMicrotask(() => {
      this.#flushOnce()
      this.#scheduleRetry(0)
    })
  }

  /**
   * @param {number} attempt Index into `RETRY_DELAYS` for the next retry.
   * @returns {void}
   */
  #scheduleRetry (attempt) {
    if (this.#pending === undefined) return
    if (attempt >= RETRY_DELAYS.length) {
      // Give up: leave exports as-is to avoid unbounded retries.
      this.#pending = undefined
      return
    }
    const timer = setTimeout(() => {
      this.#flushOnce()
      this.#scheduleRetry(attempt + 1)
    }, RETRY_DELAYS[attempt])
    // Don't keep the process alive just for best-effort retries.
    if (timer && typeof timer.unref === 'function') timer.unref()
  }
}

exports.register = register
exports.ModuleBinder = ModuleBinder
exports.importHooks = importHooks
exports.specifiers = specifiers
exports.toHook = toHook
