// Resolves the placeholder imports of facades written by `test/wrapper` tests
// through their manifests: a facade `x.mjs` keeps its `imports` manifest in
// `x.mjs.imports.json`, and each placeholder resolves to its entry's URL.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * @param {string} parentURL
 */
function readManifest (parentURL) {
  try {
    return JSON.parse(readFileSync(`${fileURLToPath(parentURL)}.imports.json`, 'utf8'))
  } catch {
    return undefined
  }
}

export async function resolve (specifier, context, nextResolve) {
  const { parentURL } = context
  if (specifier.startsWith('./__iitm_') && parentURL?.startsWith('file:')) {
    const entry = readManifest(parentURL)?.find((entry) => entry.specifier === specifier)
    if (entry !== undefined) {
      const { url, format } = entry
      return format === undefined ? { url, shortCircuit: true } : { url, format, shortCircuit: true }
    }
  }
  return nextResolve(specifier, context)
}
