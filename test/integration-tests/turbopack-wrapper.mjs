import { readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, sep } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { createWrapperModule } from '../../bundler.mjs'

const generatedNames = [
  'iitm-dependency.mjs',
  'iitm-original.mjs',
  'iitm-wrapper.mjs'
]

/**
 * @param {string} appDirectory The Next.js application directory.
 * @param {number} initialValue The dependency's initial live export.
 * @returns {Promise<Awaited<ReturnType<typeof createWrapperModule>>>}
 */
export async function prepareTurbopackWrapper (appDirectory, initialValue) {
  const originalPath = `${appDirectory}/iitm-original.mjs`
  const wrapperPath = `${appDirectory}/iitm-wrapper.mjs`
  const originalSource = `export { live, increment } from './iitm-dependency.mjs'
export const stable = 42
`
  await Promise.all([
    writeFile(originalPath, originalSource),
    updateTurbopackSource(appDirectory, initialValue)
  ])

  const wrapper = await createWrapperModule({
    module: {
      url: pathToFileURL(originalPath).href,
      format: 'module',
      source: originalSource,
      specifier: 'iitm-turbopack-live',
      data: { bundler: 'turbopack' },
      passthroughExports: selectLiveExport
    },
    resolve: resolveModule,
    load: loadModule
  })

  let code = wrapper.code
  for (const entry of wrapper.imports) {
    const specifier = relativeImport(wrapperPath, entry.target.url)
    code = code.replaceAll(JSON.stringify(entry.specifier), JSON.stringify(specifier))
  }
  await writeFile(wrapperPath, code)
  return wrapper
}

/**
 * @param {string} appDirectory The Next.js application directory.
 * @param {number} initialValue The dependency's initial live export.
 * @returns {Promise<void>}
 */
export async function updateTurbopackSource (appDirectory, initialValue) {
  const source = `export let live = ${initialValue}
export function increment () { live++ }
`
  await writeFile(`${appDirectory}/iitm-dependency.mjs`, source)
}

/**
 * @param {string} appDirectory The Next.js application directory.
 * @returns {Promise<void>}
 */
export async function removeTurbopackWrapper (appDirectory) {
  await Promise.all(generatedNames.map(name => rm(`${appDirectory}/${name}`, { force: true })))
}

/**
 * @param {string} specifier The imported module specifier.
 * @param {{ parentURL?: string }} context The importing module context.
 * @returns {{ url: string, format: 'module', watchFiles: string[] }}
 */
function resolveModule (specifier, context) {
  const url = new URL(specifier, context.parentURL).href
  return { url, format: 'module', watchFiles: [url] }
}

/**
 * @param {string} url The resolved module URL.
 * @returns {Promise<{ source: Buffer, format: 'module', watchFiles: string[] }>}
 */
async function loadModule (url) {
  return {
    source: await readFile(new URL(url)),
    format: 'module',
    watchFiles: [url]
  }
}

/**
 * @param {string} wrapperPath The generated wrapper path.
 * @param {string} targetUrl The manifest target URL.
 * @returns {string}
 */
function relativeImport (wrapperPath, targetUrl) {
  let specifier = relative(dirname(wrapperPath), fileURLToPath(targetUrl)).split(sep).join('/')
  if (!specifier.startsWith('.')) specifier = `./${specifier}`
  return specifier
}

/**
 * @param {ReadonlyArray<{ name: string, url: string, localName?: string }>} exports The resolved exports.
 * @returns {string[]}
 */
function selectLiveExport (exports) {
  const binding = exports.find(({ name }) => name === 'live')
  if (binding?.localName !== 'live' || !binding.url.endsWith('/iitm-dependency.mjs')) {
    throw new Error('IITM did not resolve the live re-export')
  }
  return [binding.name]
}
