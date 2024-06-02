import { spawnSync } from 'child_process'
import { deepStrictEqual } from 'assert'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const cwd = dirname(fileURLToPath(import.meta.url))
const hook = resolve(cwd, '..', '..', 'hook.mjs')

let errored = false

function getExports (name, loader) {
  const args = ['--input-type=module', '--no-warnings', '-e', `import * as lib from '${name}'; console.log(JSON.stringify(Object.keys(lib)))`]
  if (loader) args.push(loader)
  const out = spawnSync(process.execPath, args, { cwd })
  if (out.status !== 0) {
    console.error(out.stderr.toString())
    throw new Error()
  }
  const stdout = out.stdout.toString()
  return JSON.parse(stdout).sort()
}

function testLib (name) {
  try {
    const expected = getExports(name)
    const actual = getExports(name, `--experimental-loader=${hook}`)
    deepStrictEqual(actual, expected, `Exports for ${name} are different`)
    console.log(`✅  Exports for '${name}' match`)
  } catch (err) {
    console.error(`❌  Error getting exports for '${name}':`, err)
    errored = true
  }
}

function installLibs (names) {
  spawnSync('npm', ['init', '-y'], { cwd })
  spawnSync('npm', ['install', ...names], { cwd })
}

const modules = [
  'ansi-styles', 'semver', 'supports-color', 'chalk', 'has-flag', 'debug',
  'tslib', 'color-convert', 'ms', 'color-name', 'lru-cache', 'minimatch',
  'strip-ansi', 'source-map', 'ansi-regex', 'glob', 'readable-stream',
  'commander', 'yallist', 'string-width', 'escape-string-regexp',
  'brace-expansion', 'find-up', 'p-locate', 'locate-path', 'wrap-ansi',
  'p-limit', 'safe-buffer', 'kind-of', 'minipass', 'uuid', 'string_decoder',
  'ajv', 'emoji-regex', 'isarray', 'react-is', 'fs-extra',
  'is-fullwidth-code-point', 'get-stream', 'json-schema-traverse',
  'yargs-parser', 'glob-parent', 'yargs', 'rimraf', 'acorn', 'which',
  'estraverse', 'js-yaml', 'path-exists', 'argparse', 'pretty-format',
  'resolve-from', 'cliui', 'schema-utils', 'globals', 'camelcase', 'execa',
  'punycode', 'path-key', 'signal-exit', 'inherits', 'resolve', 'mkdirp',
  'is-stream', 'ws', 'universalify', 'qs', 'slash', 'json5', 'iconv-lite',
  'form-data', 'is-number', 'webidl-conversions', 'eslint-visitor-keys',
  '@jest/types', 'postcss', 'make-dir', 'pify', 'cross-spawn', 'braces',
  'whatwg-url', 'fill-range', 'eslint-scope', 'tr46', 'micromatch',
  'convert-source-map', 'define-property', 'agent-base', 'shebang-regex',
  'shebang-command', 'mimic-fn', 'globby', 'npm-run-path', 'mime',
  '@babel/code-frame', 'extend-shallow', 'to-regex-range', 'onetime',
  'https-proxy-agent', 'y18n', 'buffer', 'strip-bom', 'is-glob',
  'doctrine', 'picocolors', 'pkg-dir', '@babel/types',
  'regenerator-runtime', 'human-signals', '@jridgewell/trace-mapping',
  'ignore', 'jsesc', 'parse-json', 'jest-worker', 'graceful-fs',
  'jest-util', 'jsonfile', 'normalize-path', 'strip-json-comments',
  'cosmiconfig', 'minimist', 'path-type', '@babel/parser', 'balanced-match',
  'picomatch', 'typescript', 'isexe', 'statuses', 'entities', 'bytes',
  'node-fetch', 'http-errors', '@babel/highlight',
  '@babel/helper-validator-identifier', 'function-bind',
  'async', 'sprintf-js', '@babel/generator', 'is-extendable',
  'get-intrinsic', 'lodash', 'mime-db', 'source-map-support', 'mime-types',
  'is-arrayish', '@babel/core', 'once', 'anymatch', 'depd',
  'hosted-git-info', 'path-to-regexp', 'axios', 'is-core-module',
  '@babel/template', 'cookie', 'write-file-atomic', 'js-tokens',
  '@typescript-eslint/typescript-estree', '@typescript-eslint/types',
  'object-inspect', 'wrappy', 'is-extglob', 'chokidar',
  '@typescript-eslint/visitor-keys', 'call-bind', 'loader-utils',
  'browserslist', 'http-proxy-agent', 'fast-glob', 'concat-map',
  'inflight', 'ajv-keywords', 'ansi-escapes', 'ci-info', 'fast-deep-equal',
  'caniuse-lite', 'fs.realpath', '@jridgewell/gen-mapping', 'setprototypeof',
  'strip-final-newline', 'optionator', 'path-is-absolute', '@babel/traverse',
  'core-util-is', 'has-symbols', 'yocto-queue', 'p-try',
  'electron-to-chromium', '@smithy/smithy-client', 'yaml', 'ini',
  '@babel/helper-plugin-utils', 'jest-get-type', 'type-check', 'levn',
  'is-descriptor', 'prelude-ls', 'slice-ansi',
  '@typescript-eslint/scope-manager', 'isobject', 'esprima',
  '@babel/helper-split-export-declaration', 'callsites', 'readdirp',
  'escalade', 'import-fresh', 'get-caller-file', '@jridgewell/sourcemap-codec',
  'acorn-walk', 'rxjs', 'ieee754', 'is-plain-obj',
  'istanbul-lib-instrument', '@babel/helper-module-imports', 'side-channel',
  'normalize-package-data', 'is-plain-object', 'util-deprecate',
  '@jridgewell/resolve-uri', 'follow-redirects', 'array-union',
  'json-parse-even-better-errors', 'path-parse', 'has-property-descriptors',
  'uri-js', 'safer-buffer', '@babel/helpers', 'on-finished',
  '@babel/helper-function-name', 'p-map', 'postcss-value-parser', 'indent-string',
  '@babel/helper-module-transforms', 'object-assign', 'delayed-stream',
  '@nodelib/fs.stat', 'require-directory', 'diff', 'parse5',
  'asynckit', 'tmp', 'combined-stream']

console.log(`📦  Installing ${modules.length} libraries...`)
installLibs(modules)

for (const mod of modules) {
  testLib(mod)
}

if (errored) {
  console.error('❌  Some tests failed')
  process.exit(1)
}
