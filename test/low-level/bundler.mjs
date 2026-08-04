import { strictEqual, deepStrictEqual, match, doesNotMatch, rejects } from 'assert'
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'fs/promises'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

import Hook from '../../index.js'
import { createWrapperModule } from '../../bundler.mjs'

const require = createRequire(import.meta.url)
const {
  createWrapperModule: createCommonJSWrapperModule,
  getNodeModuleFormat
} = require('../../bundler.js')
const { registerCommonJS, registerWithData } = require('../../lib/bundler-runtime.js')
const moduleUrl = new URL('../fixtures/something.mjs', import.meta.url).href
const source = await readFile(new URL(moduleUrl), 'utf8')

/**
 * @returns {never}
 */
function unexpectedIo () {
  throw new Error('I/O should not be used when source is provided')
}

const wrapper = await createCommonJSWrapperModule({
  module: {
    url: moduleUrl,
    format: 'module',
    source,
    specifier: './something.mjs',
    data: { version: '1.0.0' }
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

strictEqual(wrapper.sideEffects, true)
deepStrictEqual(wrapper.watchFiles, [moduleUrl])
strictEqual(wrapper.imports.length, 2)
strictEqual(wrapper.imports[0].specifier, './__iitm_runtime__.js')
strictEqual(wrapper.imports[0].kind, 'runtime')
strictEqual(wrapper.imports[0].external, false)
strictEqual(wrapper.imports[1].specifier, './__iitm_module_0__.js')
strictEqual(wrapper.imports[1].kind, 'module')
strictEqual(wrapper.imports[1].external, false)
match(wrapper.code, /from "\.\/__iitm_runtime__\.js"/)
match(wrapper.code, /from "\.\/__iitm_module_0__\.js"/)
match(wrapper.code, /\nregisterWithData\(/)
match(wrapper.code, /\{"version":"1\.0\.0"\}\)/)
doesNotMatch(wrapper.code, /from "file:/)

const formatDirectory = await mkdtemp(join(tmpdir(), 'iitm-bundler-format-'))
try {
  const packageJsonUrl = pathToFileURL(join(formatDirectory, 'package.json')).href
  strictEqual(
    getNodeModuleFormat(pathToFileURL(join(formatDirectory, 'seeded.js')).href, packageJsonUrl, 'module'),
    'module'
  )
  await writeFile(join(formatDirectory, 'package.json'), '{"type":"module"}')
  const nestedDirectory = join(formatDirectory, 'nested')
  await mkdir(nestedDirectory)
  await writeFile(join(nestedDirectory, 'package.json'), '{"type":"commonjs"}')
  strictEqual(
    getNodeModuleFormat(pathToFileURL(join(nestedDirectory, 'module.js')).href, packageJsonUrl, 'module'),
    'commonjs'
  )
  strictEqual(getNodeModuleFormat(pathToFileURL(join(formatDirectory, 'module.js')).href), 'module')
  strictEqual(getNodeModuleFormat(pathToFileURL(join(formatDirectory, 'module.ts')).href), 'module-typescript')
  strictEqual(getNodeModuleFormat(pathToFileURL(join(formatDirectory, 'module.mjs')).href), 'module')
  strictEqual(getNodeModuleFormat(pathToFileURL(join(formatDirectory, 'module.cjs')).href), 'commonjs')
  strictEqual(getNodeModuleFormat(pathToFileURL(join(formatDirectory, 'module.mts')).href), 'module-typescript')
  strictEqual(getNodeModuleFormat(pathToFileURL(join(formatDirectory, 'module.cts')).href), 'commonjs-typescript')
} finally {
  await rm(formatDirectory, { recursive: true, force: true })
}

strictEqual(getNodeModuleFormat('node:fs'), 'builtin')
strictEqual(getNodeModuleFormat(moduleUrl.replace(/\.mjs$/, '.json')), undefined)

/**
 * @param {object} exported
 * @param {string} name
 * @param {string|undefined} baseDir
 * @param {object} data
 * @param {string} format
 */
function hookFoo (exported, name, baseDir, data, format) {
  deepStrictEqual(data, { version: '1.0.0' })
  strictEqual(format, 'module')
  exported.foo = 43
  return () => 44
}

const hook = new Hook(['./something.mjs'], hookFoo)
let executableCode = wrapper.code
for (const { specifier, target } of wrapper.imports) {
  executableCode = executableCode.replaceAll(JSON.stringify(specifier), JSON.stringify(target.url))
}
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'iitm-bundler-'))
const wrapperUrl = pathToFileURL(join(temporaryDirectory, 'wrapper.mjs')).href
try {
  await writeFile(new URL(wrapperUrl), executableCode)
  const wrappedNamespace = await import(wrapperUrl)
  strictEqual(wrappedNamespace.foo, 43)
  strictEqual(wrappedNamespace.default(), 44)
} finally {
  hook.unhook()
  await rm(temporaryDirectory, { recursive: true, force: true })
}

const rebuilt = await createWrapperModule({
  module: {
    url: moduleUrl,
    format: 'module',
    source: 'export const rebuilt = true',
    specifier: './something.mjs'
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

match(rebuilt.code, /export \{ \$rebuilt as rebuilt \}/)
match(rebuilt.code, /\nregister\(/)
doesNotMatch(rebuilt.code, /registerWithData/)
doesNotMatch(rebuilt.code, /\$foo/)

/**
 * @param {string} url
 */
function loadBuiltin (url) {
  strictEqual(url, 'node:dns/promises')
  return { format: 'builtin' }
}

const builtinWrapper = await createWrapperModule({
  module: {
    url: 'node:dns/promises',
    format: 'builtin',
    specifier: 'node:dns/promises'
  },
  resolve: unexpectedIo,
  load: loadBuiltin
})

strictEqual(builtinWrapper.imports[1].external, true)
strictEqual(builtinWrapper.imports[1].target.url, 'node:dns/promises')
doesNotMatch(builtinWrapper.code, /from "node:dns\/promises"/)

const commonJsUrl = new URL('../fixtures/something.js', import.meta.url).href
const commonJsWrapper = await createWrapperModule({
  module: {
    url: commonJsUrl,
    format: 'commonjs',
    source: '#!/usr/bin/env node\nmodule.exports = { value: 42 }\nreturn\nmodule.exports.unreachable = true',
    specifier: './something.js',
    data: { version: '1.0.0' }
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

strictEqual(commonJsWrapper.imports.length, 1)
strictEqual(commonJsWrapper.imports[0].kind, 'runtime')
match(commonJsWrapper.code, /registerCommonJS/)
doesNotMatch(commonJsWrapper.code, /^(?:import|export) /m)

const loadedCommonJsWrapper = await createWrapperModule({
  module: {
    url: commonJsUrl,
    format: 'commonjs',
    specifier: './something.js'
  },
  resolve: unexpectedIo,
  load: async () => ({ source: Buffer.from('module.exports = 42') })
})

match(loadedCommonJsWrapper.code, /module\.exports = 42/)

const typedArrayCommonJsWrapper = await createWrapperModule({
  module: {
    url: commonJsUrl,
    format: 'commonjs',
    source: new TextEncoder().encode('module.exports = 43'),
    specifier: './something.js'
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

match(typedArrayCommonJsWrapper.code, /module\.exports = 43/)

const arrayBufferCommonJsWrapper = await createWrapperModule({
  module: {
    url: commonJsUrl,
    format: 'commonjs',
    source: new TextEncoder().encode('module.exports = 44').buffer,
    specifier: './something.js'
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

match(arrayBufferCommonJsWrapper.code, /module\.exports = 44/)

await rejects(createWrapperModule({
  module: {
    url: commonJsUrl,
    format: 'commonjs',
    specifier: './something.js'
  },
  resolve: unexpectedIo,
  load: async () => ({})
}), {
  name: 'TypeError',
  message: `The bundler load adapter returned no source for '${commonJsUrl}'`
})

/**
 * @param {object} exports
 * @param {string} name
 * @param {string|undefined} baseDir
 * @param {object} data
 * @param {string} format
 */
const commonJsHookFn = (exports, name, baseDir, data, format) => {
  deepStrictEqual(data, { version: '1.0.0' })
  strictEqual(format, 'commonjs')
  return { ...exports, hooked: true }
}
const commonJsHook = new Hook(['./something.js'], commonJsHookFn)
let unfilteredCalls = 0
const unfilteredHook = new Hook((exports, name, baseDir, data) => {
  if (data?.version === '1.0.0') unfilteredCalls++
})
let commonJsCode = commonJsWrapper.code
for (const { specifier, target } of commonJsWrapper.imports) {
  commonJsCode = commonJsCode.replaceAll(JSON.stringify(specifier), JSON.stringify(fileURLToPath(target.url)))
}
const commonJsDirectory = await mkdtemp(join(tmpdir(), 'iitm-bundler-commonjs-'))
try {
  const commonJsFilename = join(commonJsDirectory, 'wrapper.cjs')
  await writeFile(commonJsFilename, commonJsCode)
  deepStrictEqual(require(commonJsFilename), { value: 42, hooked: true })
  strictEqual(unfilteredCalls, 2)
} finally {
  unfilteredHook.unhook()
  commonJsHook.unhook()
  await rm(commonJsDirectory, { recursive: true, force: true })
}

const packageUrl = new URL('../../package.json', import.meta.url).href
const sourceWatchUrl = new URL('../fixtures/', import.meta.url).href

/**
 * @param {string} specifier
 * @param {{ parentURL: string }} context
 */
function resolveModule (specifier, context) {
  return {
    url: new URL(specifier, context.parentURL).href,
    format: 'module',
    watchFiles: [packageUrl]
  }
}

const hookedPackageUrl = new URL('../fixtures/node_modules/some-external-module/index.mjs', import.meta.url).href
let packageBaseDirectory
const packageHook = new Hook(['some-external-module'], (exports, name, baseDir, data) => {
  packageBaseDirectory = baseDir
  deepStrictEqual(data, { version: '2.0.0' })
})
registerWithData(hookedPackageUrl, {}, {}, {}, 'some-external-module', { version: '2.0.0' })
strictEqual(packageBaseDirectory, fileURLToPath(new URL('.', hookedPackageUrl)).slice(0, -1))
packageHook.unhook()

const packageInternalUrl = new URL('../fixtures/node_modules/some-external-module/sub.mjs', import.meta.url).href
let packageInternalName
const packageInternalHook = new Hook(['some-external-module'], { internals: true }, (exports, name) => {
  packageInternalName = name
})
registerWithData(packageInternalUrl, {}, {}, {}, 'some-external-module/sub', undefined)
strictEqual(packageInternalName, join('some-external-module', 'sub.mjs'))
packageInternalHook.unhook()

let commonJsPackageName
const commonJsPackageHook = new Hook(['some-external-module'], (exports, name) => {
  commonJsPackageName = name
})
commonJsPackageName = undefined
registerCommonJS(hookedPackageUrl, { exports: {} }, 'some-external-module', undefined)
strictEqual(commonJsPackageName, 'some-external-module')
commonJsPackageName = undefined
registerCommonJS(
  new URL('../fixtures/node_modules/some-external-module/sub.js', import.meta.url).href,
  { exports: {} },
  './sub',
  undefined
)
strictEqual(commonJsPackageName, join('some-external-module', 'sub.js'))
commonJsPackageHook.unhook()

let invalidFileUrlName
const invalidFileUrlHook = new Hook((exports, name) => {
  invalidFileUrlName = name
})
invalidFileUrlName = undefined
registerWithData('file://%', {}, {}, {}, 'invalid', undefined)
strictEqual(invalidFileUrlName, 'file://%')
invalidFileUrlHook.unhook()

/**
 * @param {string} url
 * @param {{ format: string }} context
 */
async function loadModule (url, context) {
  return {
    source: await readFile(new URL(url), 'utf8'),
    format: context.format,
    watchFiles: [sourceWatchUrl]
  }
}

const reexportUrl = new URL('../fixtures/reexport-same-source.mjs', import.meta.url).href
const reexportWrapper = await createWrapperModule({
  module: {
    url: reexportUrl,
    format: 'module',
    specifier: './reexport-same-source.mjs'
  },
  resolve: resolveModule,
  load: loadModule
})

strictEqual(reexportWrapper.imports[0].kind, 'runtime')
strictEqual(reexportWrapper.imports[1].target.url, reexportUrl)
strictEqual(reexportWrapper.imports[2].specifier, './__iitm_module_1__.js')
strictEqual(reexportWrapper.imports[2].target.format, 'module')
strictEqual(reexportWrapper.watchFiles.includes(reexportUrl), true)
strictEqual(reexportWrapper.watchFiles.includes(packageUrl), true)
strictEqual(reexportWrapper.watchFiles.includes(sourceWatchUrl), true)
doesNotMatch(reexportWrapper.code, /from "file:/)

/**
 * @param {string} specifier
 */
function resolveCommonJsReexport (specifier) {
  strictEqual(specifier, 'file:///virtual/something.js')
  return {
    url: commonJsUrl,
    format: 'commonjs'
  }
}

const commonJsReexportWrapper = await createWrapperModule({
  module: {
    url: 'file:///virtual/commonjs-reexport.mjs',
    format: 'module',
    source: "export * from './something.js'",
    specifier: './commonjs-reexport.mjs'
  },
  resolve: resolveCommonJsReexport,
  load: loadModule
})

match(commonJsReexportWrapper.code, /export \{ \$foo as foo \}/)
doesNotMatch(commonJsReexportWrapper.code, /as default/)

const quotedExportWrapper = await createWrapperModule({
  module: {
    url: 'file:///virtual/quoted-export.mjs',
    format: 'module',
    source: 'const value = 42; export { value as "quoted name" }',
    specifier: './quoted-export.mjs'
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

match(quotedExportWrapper.code, /export \{ \$quoted_name as "quoted name" \}/)

/**
 * @param {string} specifier
 */
function resolveWithoutCanParse (specifier) {
  return {
    url: specifier === 'bare-package' ? moduleUrl : specifier,
    format: 'module'
  }
}

await createWrapperModule({
  module: {
    url: 'file:///virtual/can-parse-reexport.mjs',
    format: 'module',
    source: "export * from 'bare-package'",
    specifier: './can-parse-reexport.mjs'
  },
  resolve: resolveWithoutCanParse,
  load: loadModule
})

const canParse = URL.canParse
delete URL.canParse
try {
  await createWrapperModule({
    module: {
      url: 'file:///virtual/bare-reexport.mjs',
      format: 'module',
      source: "export * from 'bare-package'",
      specifier: './bare-reexport.mjs'
    },
    resolve: resolveWithoutCanParse,
    load: loadModule
  })
  await createWrapperModule({
    module: {
      url: 'file:///virtual/url-reexport.mjs',
      format: 'module',
      source: `export * from ${JSON.stringify(moduleUrl)}`,
      specifier: './url-reexport.mjs'
    },
    resolve: resolveWithoutCanParse,
    load: loadModule
  })
} finally {
  if (canParse === undefined) {
    delete URL.canParse
  } else {
    URL.canParse = canParse
  }
}
