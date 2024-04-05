import { createHook } from './hook.js'
import path from 'path'

const { load, resolve, getFormat, getSource } = createHook(import.meta, new Set([path.join(import.meta.url, '../test/fixtures/export-types/default-expression-array.mjs').replace(':/', ':///')]))

export { load, resolve, getFormat, getSource }
