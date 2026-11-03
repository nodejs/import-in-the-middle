import { strictEqual } from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const copies = JSON.parse(process.env.IITM_COPIES)
export const scenario = JSON.parse(process.env.IITM_COPY_SCENARIO)
/** @typedef {{ consumer: number, name: string, format: string | undefined }} HookHit */
/** @type {HookHit[]} */
export const hits = []
export const hooks = []
export const legacyPath = fileURLToPath(new URL('./cross-copy-registry-legacy.mjs', import.meta.url))
export const cjsAfter = new URL('./cross-copy-registry-target.cjs', import.meta.url).href
const esmTargets = ['some-external-module', 'some-external-module/sub']
const otherTargets = ['some-external-cjs-module', cjsAfter, 'events', 'querystring']
const allTargets = [...esmTargets, ...otherTargets]
const consumers = []

for (const consumer of scenario.order) {
  const base = pathToFileURL(copies[consumer] + '/')
  let targets = allTargets
  if (scenario.include === 'disjoint') {
    targets = consumer === 0 ? esmTargets : otherTargets
  } else if (scenario.include === 'neither' ||
    (scenario.include === 'first' && consumer !== scenario.order[0])) {
    targets = []
  }
  const { Hook } = require(fileURLToPath(new URL('index.js', base)))
  consumers.push({ consumer, targets, Hook })
  if (scenario.modes[consumer] === 'sync') {
    const { register: registerSync } = await import(new URL('register-hooks.mjs', base))
    registerSync({ include: [...targets] })
  } else {
    register(new URL('hook.mjs', base), { data: { include: targets } })
  }
}

export const { register: legacyRegister } = require(fileURLToPath(
  new URL('lib/register.js', pathToFileURL(copies[0] + '/'))
))
export const ReplayHook = consumers[1].Hook

/**
 * @param {string} name The hooked module name.
 * @param {boolean} [removed] Whether the first hook was removed.
 */
export function expectedConsumers (name, removed = false) {
  const expected = []
  for (const { consumer, targets } of consumers) {
    if (removed && consumer === scenario.order[0]) continue
    if (name === legacyPath ? targets.length > 0 : targets.includes(name)) {
      expected.push(consumer)
    }
  }
  return expected
}

export function installHooks () {
  for (const { consumer, targets, Hook } of consumers) {
    /**
     * @param {Record<string, string | ((...args: unknown[]) => string | number)>} namespace The wrapped exports.
     * @param {string} name The module name.
     * @param {string | undefined} baseDir The package directory.
     * @param {string | undefined} format The loader format.
     */
    function onImport (namespace, name, baseDir, format) {
      hits.push({ consumer, name, format })
      if (name === 'events' || name === 'querystring') {
        strictEqual(baseDir, undefined)
        const method = name === 'events' ? 'getMaxListeners' : 'escape'
        const original = namespace[method]
        /** @param {unknown[]} args The builtin arguments. */
        namespace[method] = function wrapped (...args) {
          return `${Reflect.apply(original, undefined, args)}:${consumer}`
        }
      } else {
        if (name === 'some-external-module' || name === 'some-external-cjs-module') {
          strictEqual(basename(baseDir), name)
        }
        const key = name.includes('/sub') ? 'bar' : 'foo'
        namespace[key] += `:${consumer}`
      }
    }
    const modules = targets.length === 0 ? [] : [...targets, legacyPath]
    hooks.push(new Hook(modules, onImport))
  }
}

if (!scenario.late) installHooks()
