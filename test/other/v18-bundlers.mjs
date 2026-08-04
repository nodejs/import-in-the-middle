import { deepStrictEqual, strictEqual } from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import * as esbuild from 'esbuild'
import webpack from 'webpack'

import { createWrapperModule } from '../../bundler.mjs'

const packageRoot = fileURLToPath(new URL('../../', import.meta.url))
const indexPath = join(packageRoot, 'index.js')
const temporaryDirectory = await realpath(await mkdtemp(join(tmpdir(), 'iitm-bundlers-')))

try {
  const originalPath = join(temporaryDirectory, 'original.mjs')
  const originalCommonJsPath = join(temporaryDirectory, 'original.cjs')
  const dependencyPath = join(temporaryDirectory, 'dependency.cjs')
  await writeFile(originalPath, 'export const value = 42\n')
  await writeFile(dependencyPath, 'module.exports = 42\n')

  const originalTarget = {
    namespace: 'iitm-original',
    path: originalPath,
    pluginData: { owner: 'adapter' }
  }
  const wrappers = new Map([
    ['esm', await createWrapperModule({
      module: {
        url: pathToFileURL(originalPath).href,
        format: 'module',
        source: await readFile(originalPath),
        specifier: 'iitm-virtual-esm',
        target: originalTarget,
        data: { increment: 1 }
      },
      resolve: unexpectedIo,
      load: unexpectedIo
    })],
    ['commonjs', await createWrapperModule({
      module: {
        url: pathToFileURL(originalCommonJsPath).href,
        format: 'commonjs',
        source: "module.exports = { value: require('./dependency.cjs') }\n",
        specifier: 'iitm-virtual-commonjs',
        target: { namespace: 'file', path: originalCommonJsPath },
        data: { increment: 2 }
      },
      resolve: unexpectedIo,
      load: unexpectedIo
    })]
  ])

  const entrySource = `
const Hook = require(${JSON.stringify(indexPath)})

new Hook((exports, name, baseDir, data) => {
  if (data === undefined) return
  exports.value += data.increment
})

Promise.all([
  import('iitm-virtual-esm'),
  Promise.resolve(require('iitm-virtual-commonjs'))
]).then(([esm, commonjs]) => {
  console.log(JSON.stringify({ esm: esm.value, commonjs: commonjs.value }))
})
`

  await testEsbuild(entrySource, wrappers, originalTarget)
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
 * @param {string} entrySource
 * @param {Map<string, Awaited<ReturnType<typeof createWrapperModule>>>} wrappers
 * @param {{ namespace: string, path: string, pluginData: object }} originalTarget
 */
async function testEsbuild (entrySource, wrappers, originalTarget) {
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
          if (entry.kind === 'runtime') return { path: fileURLToPath(entry.url) }
          return entry.target
        })
        build.onLoad({ filter: /.*/, namespace: 'iitm-wrapper' }, args => ({
          contents: wrappers.get(args.path).code,
          loader: 'js',
          resolveDir: temporaryDirectory
        }))
        build.onLoad({ filter: /.*/, namespace: originalTarget.namespace }, async args => {
          strictEqual(args.path, originalTarget.path)
          strictEqual(args.pluginData, originalTarget.pluginData)
          return { contents: await readFile(args.path), loader: 'js' }
        })
      }
    }]
  })

  deepStrictEqual(runBundle(outfile), { esm: 43, commonjs: 44 })
}

/**
 * @param {string} entrySource
 * @param {Map<string, Awaited<ReturnType<typeof createWrapperModule>>>} wrappers
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
    const filename = join(directory, wrapper.format === 'module' ? 'wrapper.mjs' : 'wrapper.cjs')
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
      resource.request = entry.kind === 'runtime' ? fileURLToPath(entry.url) : entry.target.path
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
  deepStrictEqual(runBundle(join(outputDirectory, 'bundle.cjs')), { esm: 43, commonjs: 44 })
}

/**
 * @param {import('webpack').Configuration} configuration
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
 * @param {string} filename
 * @returns {{ esm: number, commonjs: number }}
 */
function runBundle (filename) {
  const result = spawnSync(process.execPath, [filename], { encoding: 'utf8' })
  strictEqual(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}
