import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import * as module from 'node:module'

import Hook from '../../index.js'
import * as loader from './preloaded-cycle-loader.mjs'

/** @param {'async' | 'sync'} mode */
export async function testCircularAttributes (mode) {
  const sources = []
  const roots = []
  const attributes = [
    ['', ''],
    ['{ kind: "first" }', '{ kind: "second" }', '{ kind: "third" }'],
    ['{ kind: "first" }', '{ kind: "first" }'],
    ['{ kind: "first", mode: "same" }', '{ mode: "same", "k\\u0069nd": "f\\u0069rst" }'],
    ['', '{}', '{ kind: "first" }'],
    ['{ kind: "first" }', '{ kind: "second" }'],
    ['{ kind: "first" }'],
    ['', '{ kind: "first" }'],
    [''],
    [''],
    [''],
    ['{ kind: "indirect" }'],
    [''],
    ['{ kind: "forward" }']
  ]
  for (const [index, bags] of attributes.entries()) {
    const prefix = `file:///attribute-cycle-${mode}-${index}`
    const root = `${prefix}-root.mjs`
    const leaf = `${prefix}-leaf.mjs`
    const error = `${prefix}-error.mjs`
    const consumer = `${prefix}-consumer.mjs`
    const helper = `${prefix}-helper.mjs`
    const forward = `${prefix}-forward.mjs`
    roots.push(root)
    const imports = bags.map(
      /**
       * @param {string} bag
       * @param {number} offset
       */
      (bag, offset) =>
        `import { UserError as Error${offset}, value as value${offset} } from '${root}' ${bag ? `/* attributes */ with ${bag}` : ''};`
    )
    if (index === 7) imports[1] = imports[1].replace('/* attributes */ ', '\n')
    if (index === 4 || index === 6) {
      imports.unshift(`import '${error}';`)
    } else if (index < 7) {
      imports.push(`import '${error}';`)
    }
    if (index === 5) {
      imports.unshift(`export { UserError as Reexported } from '${root}' with ${bags[0]};`)
    }
    const body = `${imports.join('\n')}
        import * as rootNamespace from '${root}';
        export class RegistryError extends Error${bags.length - 1} {}
        ${index >= 8 ? '' : 'export const value = 1;'}
        export function readStatic () { return value${bags.length - 1} }
        export function readNamespace () { return rootNamespace.value }
        export function names () { return Object.keys(rootNamespace) }
        export function getNamespace () { return rootNamespace }
        export function read () { return import('${root}') }`
    sources.push(
      [root, `${index >= 8 ? 'export const value = 1;' : ''}
        ${index === 9 ? 'const extra = 5; export { extra as "x-y" }; export default 1;' : ''}
        export { UserError } from '${error}'; export * from '${leaf}';`],
      [error, 'export class UserError extends Error {}'],
      [leaf, index >= 10
        ? `${index < 12 ? `import '${helper}';` : ''} export { RegistryError, readStatic, readNamespace, names, getNamespace, read } from '${consumer}';`
        : body]
    )
    if (index >= 10) {
      if (index < 12) sources.push([helper, index === 10 ? '' : 'export {}'])
      if (index % 2 === 1) {
        sources.push(
          [forward, `export { UserError, value } from '${root}';`],
          [consumer, body.replaceAll(`from '${root}' /* attributes */`, `from '${forward}' /* attributes */`)]
        )
      } else {
        sources.push([consumer, body])
      }
    }
  }
  if (mode === 'sync') {
    loader.initialize({ sources })
    module.registerHooks({ resolve: loader.resolve, load: loader.load })
    const { register } = await import('../../register-hooks.mjs')
    register({ include: roots })
  } else {
    module.register(new URL('./preloaded-cycle-loader.mjs', import.meta.url), { data: { sources } })
    module.register(new URL('../../hook.mjs', import.meta.url), { data: { include: roots } })
  }
  /** @param {Record<string, unknown>} exports */
  const hook = new Hook(exports => {
    exports.value = 2
    if (Object.hasOwn(exports, 'default')) exports.default = 4
    if (Object.hasOwn(exports, 'x-y')) exports['x-y'] = 6
  })
  let lateHook
  const loaded = []
  try {
    for (const [index, root] of roots.entries()) {
      const exports = await import(root)
      loaded.push(exports)
      if (index === 9) {
        strictEqual(exports.default, 4)
        strictEqual(exports['x-y'], 6)
      }
      strictEqual(exports.getNamespace(), exports)
      strictEqual(exports.value, 2)
      strictEqual(exports.readStatic(), 2)
      strictEqual(exports.readNamespace(), 2)
      deepStrictEqual(exports.names(), Object.keys(exports))
      strictEqual(new exports.RegistryError() instanceof exports.UserError, true)
      strictEqual((await exports.read()).value, 2)
      strictEqual((await exports.read()).value, 2)
    }
    /** @param {Record<string, unknown>} exports */
    lateHook = new Hook(exports => {
      exports.value = 3
      if (Object.hasOwn(exports, 'default')) exports.default = 5
      if (Object.hasOwn(exports, 'x-y')) exports['x-y'] = 7
    })
    for (const exports of loaded) {
      if (Object.hasOwn(exports, 'default')) {
        strictEqual(exports.default, 5)
        strictEqual(exports['x-y'], 7)
      }
      strictEqual(exports.value, 3)
      strictEqual(exports.readStatic(), 3)
      strictEqual(exports.readNamespace(), 3)
    }
  } finally {
    lateHook?.unhook()
    hook.unhook()
  }
}
