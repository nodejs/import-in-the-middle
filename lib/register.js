// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

const importHooks = [] // TODO should this be a Set?
const setters = new WeakMap()
const getters = new WeakMap()
const specifiers = new Map()
const toHook = []

const proxyHandler = {
  set (target, name, value) {
    const set = setters.get(target)
    const setter = set && set[name]
    if (typeof setter === 'function') {
      return setter(value)
    }
    // If a module doesn't export the property being assigned (e.g. no default
    // export), there is no setter to call. Don't crash userland code.
    return true
  },

  get (target, name) {
    if (name === Symbol.toStringTag) {
      return 'Module'
    }

    const getter = getters.get(target)[name]

    if (typeof getter === 'function') {
      return getter()
    }
  },

  defineProperty (target, property, descriptor) {
    if ((!('value' in descriptor))) {
      throw new Error('Getters/setters are not supported for exports property descriptors.')
    }

    const set = setters.get(target)
    const setter = set && set[property]
    if (typeof setter === 'function') {
      return setter(descriptor.value)
    }
    return true
  }
}

function register (name, namespace, set, get, specifier) {
  specifiers.set(name, specifier)
  setters.set(namespace, set)
  getters.set(namespace, get)
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
 * through iitm's proxy. Each wrapper holds a local binding per export plus
 * `write`/`read` closures over it; `bind` seeds that binding from the real
 * module and installs the proxy's `set`/`get` for the name, and `flush` resolves
 * any export that was undefined (circular import) once it becomes available.
 *
 * This is the boilerplate the wrapper used to inline in full per module. Hoisting
 * it here compiles it once instead of once per wrapped module and keeps the
 * per-export bind call site monomorphic.
 */
class ModuleBinder {
  // Mimics a Module namespace object (https://tc39.es/ecma262/#sec-module-namespace-objects).
  namespace = Object.create(null, { [Symbol.toStringTag]: { value: 'Module' } })
  set = {}
  get = {}
  #overridden = Object.create(null)
  #pending = []

  /**
   * Seeds `key` from `source` and installs its proxy accessors. A value that is
   * undefined or throws `ReferenceError` (temporal dead zone during a circular
   * import) is deferred to `flush`; any other throw propagates.
   *
   * @param {string} key The export name.
   * @param {object} source The real module namespace to read the value from.
   * @param {(value: unknown) => void} write Assigns the wrapper's local binding.
   * @param {() => unknown} read Reads the wrapper's local binding.
   * @param {boolean} useFallback Fall back to `source.default` (the synthetic
   * `module.exports` name a builtin does not expose on its ESM namespace).
   * @returns {void}
   */
  bind (key, source, write, read, useFallback) {
    const readSource = useFallback
      ? () => source[key] ?? source.default
      : () => source[key]
    this.#overridden[key] = false
    let deferred = false
    try {
      const value = readSource()
      write(value)
      this.namespace[key] = value
    } catch (error) {
      if (!(error instanceof ReferenceError)) throw error
      deferred = true
    }
    if (deferred || read() === undefined) {
      this.#pending.push(this.#makeUpdater(key, readSource, write))
    }
    this.set[key] = (value) => {
      this.#overridden[key] = true
      write(value)
      return true
    }
    this.get[key] = read
  }

  /**
   * @param {string} key The export name to update.
   * @param {() => unknown} readSource Reads the current value from the real module.
   * @param {(value: unknown) => void} write Assigns the wrapper's local binding.
   * @returns {() => boolean} Updater returning whether the value is now settled.
   */
  #makeUpdater (key, readSource, write) {
    return () => {
      if (this.#overridden[key] === true) return true
      try {
        const value = readSource()
        if (value !== undefined) {
          write(value)
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
    const next = []
    for (const updater of this.#pending) {
      // If it still throws ReferenceError, keep it for the (single) next attempt.
      if (updater() !== true) next.push(updater)
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
    if (this.#pending.length === 0) return
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
    if (this.#pending.length === 0) return
    if (attempt >= RETRY_DELAYS.length) {
      // Give up: leave exports as-is to avoid unbounded retries.
      this.#pending = []
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
