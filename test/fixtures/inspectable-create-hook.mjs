import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'

const createHookUrl = new URL('../../create-hook.mjs', import.meta.url)
let source = readFileSync(createHookUrl, 'utf8')

/**
 * @param {string} _match
 * @param {string} prefix
 * @param {string} relative
 */
function resolveImport (_match, prefix, relative) {
  const absolute = new URL('../../' + relative.slice(2), import.meta.url).href
  return prefix + JSON.stringify(absolute)
}

source = source.replace(/(from |import )'(\.\/[^']+)'/g, resolveImport)
source = source.replace(
  'return { initialize, load, resolve, resolveSync, loadSync, applyOptions }',
  'return { initialize, load, resolve, resolveSync, loadSync, applyOptions, specifiers }'
)

const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const { createHook } = await import(dataUrl)

export { createHook }
