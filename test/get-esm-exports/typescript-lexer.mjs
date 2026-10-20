import { deepStrictEqual } from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { init, parse } from 'es-module-lexer'

// The lexer must classify TypeScript-only declarations without requiring
// Node's runtime type stripping. This protects the minimum lexer version.
await init
const fixture = readFileSync(fileURLToPath(new URL('../fixtures/typescript-hook.mts', import.meta.url)), 'utf8')
const exports = parse(fixture)[1]
const names = exports.filter((item) => !item.typeOnly).map((item) => item.name).sort()
const types = exports.filter((item) => item.typeOnly).map((item) => item.name).sort()
deepStrictEqual(names, ['Delta', 'alpha', 'beta', 'castAlpha', 'castBeta', 'gamma'])
deepStrictEqual(types, ['AlsoAType', 'Debugger', 'OnlyAType'])
