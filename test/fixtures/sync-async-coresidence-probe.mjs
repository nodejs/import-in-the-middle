import { basename } from 'node:path'

import { Hook } from '../../index.js'
import { hits } from './sync-async-coresidence-state.mjs'

/**
 * @param {Record<string, unknown>} exports
 * @param {string} name
 * @param {string | undefined} baseDir
 */
function onImport (exports, name, baseDir) {
  hits.push({ name, baseDir: baseDir === undefined ? undefined : basename(baseDir) })
  if (baseDir !== undefined) {
    exports.foo = `instrumented:${name}`
  }
}

// eslint-disable-next-line no-new
new Hook(['events', 'some-external-module', 'some-external-cjs-module'], onImport)
