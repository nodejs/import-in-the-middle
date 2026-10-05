import { rejects, strictEqual } from 'node:assert/strict'
import * as module from 'node:module'

import Hook from '../../index.js'
import * as loader from './preloaded-cycle-loader.mjs'

/** @param {'async' | 'sync'} mode */
export async function testCircularAttributes (mode) {
  const syntaxes = Number(process.versions.node.split('.')[0]) < 22 ? ['with', 'assert'] : ['with']
  const sources = []
  const roots = []
  const invalid = `file:///attribute-cycle-${mode}-invalid.mjs`
  sources.push([invalid, 'import "node:fs" assert();'])
  for (const syntax of syntaxes) {
    const attributes = [
      ['', ''],
      ['{ kind: "first" }', '{ kind: "second" }', '{ kind: "third" }'],
      ['{ kind: "first" }', '{ kind: "first" }'],
      ['{ kind: "first", mode: "same" }', '{ mode: "same", "k\\u0069nd": "f\\u0069rst" }'],
      ['', '{}', '{ kind: "first" }'],
      ['{ kind: "first" }', '{ kind: "second" }'],
      ['{ kind: "first" }'],
      ['', '// attributes\u2028 { kind: "first" }'],
      ['', '// attributes\u2029 { kind: "first" }'],
      ['', '{ kind: "first" }']
    ]
    for (const [index, bags] of attributes.entries()) {
      const prefix = `file:///attribute-cycle-${mode}-${syntax}-${index}`
      const root = `${prefix}-root.mjs`
      const leaf = `${prefix}-leaf.mjs`
      const error = `${prefix}-error.mjs`
      roots.push(root)
      const imports = bags.map(
        /**
         * @param {string} bag
         * @param {number} offset
         */
        (bag, offset) =>
          `import { UserError as Error${offset} } from '${root}' ${bag ? `/* attributes */ ${syntax} ${bag}` : ''};`
      )
      if (index === 9) {
        imports[1] = syntax === 'with'
          ? imports[1].replace('/* attributes */ ', '\n')
          : imports[1].replace('/* attributes */ ', '\n').replace('assert {', 'assert\n{')
      }
      if (index === 0) {
        imports[0] = imports[0].slice(0, -1) + ' /* assertion comment */'.repeat(22) + '\nassertion()'
      }
      if (index === 4 || index === 6) {
        imports.unshift(`import '${error}';`)
      } else if (index < 7) {
        imports.push(`import '${error}';`)
      }
      if (index === 5) {
        imports.unshift(`export { UserError as Reexported } from '${root}' ${syntax} ${bags[0]};`)
      }
      sources.push(
        [root, `export { UserError } from '${error}'; export * from '${leaf}';`],
        [error, 'export class UserError extends Error {}'],
        [leaf, `${imports.join('\n')}
          export class RegistryError extends Error${bags.length - 1} {}
          function assertion () {}
          function assert () {}
          export const value = 1;
          export const message = "import 'missing' assert { kind: 'literal' }";
          export function read () { return import('${root}') }`]
      )
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
  const hook = new Hook(exports => { exports.value = 2 })
  try {
    await rejects(import(invalid), { name: 'SyntaxError', message: /Unexpected/ })
    for (const root of roots) {
      const exports = await import(root)
      strictEqual(exports.message, "import 'missing' assert { kind: 'literal' }")
      strictEqual(new exports.RegistryError() instanceof exports.UserError, true)
      strictEqual((await exports.read()).value, 2)
      strictEqual((await exports.read()).value, 2)
    }
  } finally {
    hook.unhook()
  }
}
