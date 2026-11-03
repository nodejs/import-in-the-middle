import { strictEqual } from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { ESLint } from 'eslint'

import { legacyLoaderSource } from '../../lib/registry.js'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../../', import.meta.url))
const eslint = new ESLint({ cwd: root })

const base = pathToFileURL(dirname(require.resolve('iitm-legacy-v3/package.json')) + '/')
const source = legacyLoaderSource(new URL('hook.mjs', base).href)
strictEqual(typeof source, 'string')
const [result] = await eslint.lintText(source, { filePath: 'hook.mjs' })
strictEqual(result.errorCount, 0, JSON.stringify(result.messages))
strictEqual(result.warningCount, 0, JSON.stringify(result.messages))
