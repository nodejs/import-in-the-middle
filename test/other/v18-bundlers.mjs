import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import * as esbuild from 'esbuild'
import webpack from 'webpack'

import { createWrapperModule } from '../../bundler.mjs'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
const indexPath = join(packageRoot, 'index.js')
const temporaryDirectory = await realpath(await mkdtemp(join(tmpdir(), 'iitm-bundlers-')))
const expectedResult = {
  esmLive: 42,
  esmStable: 43,
  hookedLive: 42,
  commonjs: 44
}

try {
  const originalPath = join(temporaryDirectory, 'original.mjs')
  const originalCommonJsPath = join(temporaryDirectory, 'original.cjs')
  const dependencyPath = join(temporaryDirectory, 'dependency.cjs')
  const originalSource = `export let live = 41
export const stable = 42
export function increment () { live++ }
`
  await Promise.all([
    writeFile(originalPath, originalSource),
    writeFile(dependencyPath, 'module.exports = 42\n')
  ])

  const wrappers = new Map([
    ['esm', await createWrapperModule({
      module: {
        url: pathToFileURL(originalPath).href,
        format: 'module',
        source: originalSource,
        specifier: 'iitm-virtual-esm',
        passthroughExports: ['live']
      },
      resolve: unexpectedIo,
      load: unexpectedIo
    })],
    ['commonjs', await createWrapperModule({
      module: {
        url: pathToFileURL(originalCommonJsPath).href,
        format: 'commonjs',
        source: "module.exports = { value: require('./dependency.cjs') }\n",
        specifier: 'iitm-virtual-commonjs'
      },
      resolve: unexpectedIo,
      load: unexpectedIo
    })]
  ])

  const entrySource = `
const Hook = require(${JSON.stringify(indexPath)})

let hookedEsm
/** @param {Record<string, unknown>} exports The intercepted exports. */
function hookExports (exports) {
  if ('live' in exports) {
    hookedEsm = exports
    exports.live = 100
    exports.stable++
    return
  }
  exports.value += 2
}

new Hook(hookExports)

async function main () {
  const [esm, commonjs] = await Promise.all([
    import('iitm-virtual-esm'),
    Promise.resolve(require('iitm-virtual-commonjs'))
  ])
  esm.increment()
  console.log(JSON.stringify({
    esmLive: esm.live,
    esmStable: esm.stable,
    hookedLive: hookedEsm.live,
    commonjs: commonjs.value
  }))
}

main()
`

  await testEsbuild(entrySource, wrappers)
  await testWebpack(entrySource, wrappers)
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true })
}

/**
 * @returns {never}
 */
function unexpectedIo () {
  throw new Error('Unexpected adapter I/O')
}

/**
 * @param {string} entrySource The application entry source.
 * @param {Map<string, Awaited<ReturnType<typeof createWrapperModule>>>} wrappers Generated wrappers by module format.
 */
async function testEsbuild (entrySource, wrappers) {
  const outfile = join(temporaryDirectory, 'esbuild.cjs')
  await esbuild.build({
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile,
    stdin: {
      contents: entrySource,
      loader: 'js',
      resolveDir: temporaryDirectory
    },
    plugins: [{
      name: 'iitm-test-adapter',
      setup (build) {
        build.onResolve({ filter: /^iitm-virtual-/ }, args => ({
          path: args.path === 'iitm-virtual-esm' ? 'esm' : 'commonjs',
          namespace: 'iitm-wrapper'
        }))
        build.onResolve({ filter: /^\.\/__iitm_/, namespace: 'iitm-wrapper' }, args => {
          const wrapper = wrappers.get(args.importer)
          const entry = wrapper.imports.find(entry => entry.specifier === args.path)
          return {
            path: fileURLToPath(entry.target.url),
            external: entry.external
          }
        })
        build.onLoad({ filter: /.*/, namespace: 'iitm-wrapper' }, args => ({
          contents: wrappers.get(args.path).code,
          loader: 'js',
          resolveDir: temporaryDirectory
        }))
      }
    }]
  })

  deepStrictEqual(runBundle(outfile), expectedResult)
}

/**
 * @param {string} entrySource The application entry source.
 * @param {Map<string, Awaited<ReturnType<typeof createWrapperModule>>>} wrappers Generated wrappers by module format.
 */
async function testWebpack (entrySource, wrappers) {
  const webpackDirectory = join(temporaryDirectory, 'webpack')
  const outputDirectory = join(webpackDirectory, 'dist')
  const wrappersByContext = new Map()
  await mkdir(outputDirectory, { recursive: true })

  const entryPath = join(webpackDirectory, 'entry.cjs')
  await writeFile(entryPath, entrySource)
  for (const [name, wrapper] of wrappers) {
    const directory = name === 'commonjs' ? temporaryDirectory : join(webpackDirectory, name)
    const extension = name === 'commonjs' ? 'cjs' : 'mjs'
    const filename = join(directory, `wrapper.${extension}`)
    await mkdir(directory, { recursive: true })
    await writeFile(filename, wrapper.code)
    wrappersByContext.set(directory, { filename, wrapper })
  }

  const replacement = new webpack.NormalModuleReplacementPlugin(
    /^(?:iitm-virtual-|\.\/__iitm_)/,
    resource => {
      if (resource.request === 'iitm-virtual-esm') {
        resource.request = wrappersByContext.get(join(webpackDirectory, 'esm')).filename
        return
      }
      if (resource.request === 'iitm-virtual-commonjs') {
        resource.request = wrappersByContext.get(temporaryDirectory).filename
        return
      }

      const { wrapper } = wrappersByContext.get(resource.context)
      const entry = wrapper.imports.find(entry => entry.specifier === resource.request)
      resource.request = fileURLToPath(entry.target.url)
    }
  )

  const stats = await runWebpack({
    entry: entryPath,
    mode: 'development',
    target: 'node',
    devtool: false,
    output: {
      path: outputDirectory,
      filename: 'bundle.cjs',
      chunkFilename: '[name].cjs'
    },
    plugins: [replacement]
  })
  const errors = stats.toJson({ all: false, errors: true }).errors
  deepStrictEqual(errors, [])
  deepStrictEqual(runBundle(join(outputDirectory, 'bundle.cjs')), expectedResult)
}

/**
 * @param {import('webpack').Configuration} configuration The webpack configuration.
 * @returns {Promise<import('webpack').Stats>}
 */
function runWebpack (configuration) {
  return new Promise((resolve, reject) => {
    webpack(configuration, (error, stats) => {
      if (error) return reject(error)
      resolve(stats)
    })
  })
}

/**
 * @param {string} filename The bundle entry file.
 * @returns {{ esmLive: number, esmStable: number, hookedLive: number, commonjs: number }}
 */
function runBundle (filename) {
  const result = spawnSync(process.execPath, [filename], {
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' }
  })
  strictEqual(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}
