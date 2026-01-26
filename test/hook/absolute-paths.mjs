import path from 'path'
import { fileURLToPath } from 'url'
import { deepStrictEqual } from 'assert'
import Hook from '../../index.js'

const hooked = []
const TOP = path.resolve(fileURLToPath(import.meta.url), '../../../')
Hook([
  `${TOP}/test/fixtures/index.js`,
  `${TOP}/test/fixtures/something.js`,
  `${TOP}/test/fixtures/node_modules/some-external-module/index.mjs`,
  `${TOP}/test/fixtures/node_modules/some-external-module/sub.mjs`
], (_, name, baseDir) => {
  hooked.push([name, baseDir])
})

;(async () => {
  // Import an absolute path.
  await import(`${TOP}/test/fixtures/index.js`)

  // Import a relative path.
  await import('../fixtures/something.js')

  // Absolute path, note the file happens to be in a `node_modules` dir.
  await import(`${TOP}/test/fixtures/node_modules/some-external-module/index.mjs`)

  // Relative path, note the file happens to be in a `node_modules` dir.
  await import('../fixtures/node_modules/some-external-module/sub.mjs')

  deepStrictEqual(
    hooked,
    [
      [`${TOP}/test/fixtures/index.js`, undefined],
      [`${TOP}/test/fixtures/something.js`, undefined],
      [`${TOP}/test/fixtures/node_modules/some-external-module/index.mjs`, undefined],
      [`${TOP}/test/fixtures/node_modules/some-external-module/sub.mjs`, undefined]
    ]
  )
})()
