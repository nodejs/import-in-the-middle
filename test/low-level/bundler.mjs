import { strictEqual, deepStrictEqual, match, doesNotMatch, rejects, throws } from 'assert'
import { spawnSync } from 'child_process'
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'fs/promises'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

import Hook from '../../index.js'
import { createWrapperModule, getPackageDetails } from '../../bundler.mjs'

const require = createRequire(import.meta.url)
const {
  createWrapperModule: createCommonJSWrapperModule,
  getPackageDetails: getCommonJSPackageDetails,
  getNodeModuleFormat
} = require('../../bundler.js')
const { ModuleBinder, registerCommonJS, registerWithData } = require('../../lib/bundler-runtime.js')
const createGetNodeModuleFormat = require('../../lib/get-node-module-format.js')
const moduleUrl = new URL('../fixtures/something.mjs', import.meta.url).href
const reexportLeafUrl = new URL('../fixtures/reexport-same-source-leaf.mjs', import.meta.url).href
const source = await readFile(new URL(moduleUrl), 'utf8')

/**
 * @returns {never}
 */
function unexpectedIo () {
  throw new Error('I/O should not be used when source is provided')
}

/**
 * @returns {never}
 */
function unexpectedPassthroughSelection () {
  throw new Error('Unexpected passthrough export selection')
}

/**
 * @param {ReadonlyArray<{ name: string, url: string, localName?: string }>} exports The resolved exports.
 * @returns {string}
 */
function selectLiveExport (exports) {
  deepStrictEqual(exports, [
    { name: 'live', url: liveModuleUrl, localName: 'live' },
    { name: 'stable', url: liveModuleUrl, localName: 'stable' },
    { name: 'increment', url: liveModuleUrl, localName: 'increment' }
  ])
  return 'live'
}

/**
 * @param {ReadonlyArray<{ name: string, url: string, localName?: string }>} exports The resolved star exports.
 * @returns {string[]}
 */
function selectValExport (exports) {
  deepStrictEqual(exports, [{ name: 'val', url: reexportLeafUrl, localName: 'val' }])
  return exports.map(({ name }) => name)
}

/**
 * @param {string} name The canonical module URL.
 * @param {string} specifier The original import specifier.
 * @param {unknown} data Consumer data associated with the module.
 */
function registerModuleWithData (name, specifier, data) {
  registerWithData(name, new ModuleBinder({}), specifier, data)
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
strictEqual(wrapper.sourceLineOffset, undefined)
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

const inferredCommonJsWrapper = await createWrapperModule({
  module: {
    url: new URL('../fixtures/typeless-commonjs.js', import.meta.url).href,
    source: 'module.exports = class Example {}',
    specifier: 'typeless-commonjs',
    data: { version: '1.0.0' }
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

strictEqual(inferredCommonJsWrapper.imports.length, 1)
strictEqual(inferredCommonJsWrapper.imports[0].kind, 'runtime')
strictEqual(inferredCommonJsWrapper.sourceLineOffset, 1)
match(inferredCommonJsWrapper.code, /registerCommonJS\(/)
doesNotMatch(inferredCommonJsWrapper.code, /registerWithData\(/)

const emptyPassthroughWrapper = await createWrapperModule({
  module: {
    url: moduleUrl,
    format: 'module',
    source,
    specifier: './something.mjs',
    data: { version: '1.0.0' },
    passthroughExports: []
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})
deepStrictEqual(emptyPassthroughWrapper, wrapper)

const emptySourceUrl = 'virtual:iitm-empty'
const emptySourceWrapper = await createWrapperModule({
  module: {
    url: emptySourceUrl,
    format: 'module',
    source: '',
    specifier: emptySourceUrl
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

strictEqual(emptySourceWrapper.imports[1].target.url, emptySourceUrl)
doesNotMatch(emptySourceWrapper.code, /^export /m)

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
  const typelessDirectory = join(formatDirectory, 'typeless')
  await mkdir(typelessDirectory)
  await writeFile(join(typelessDirectory, 'package.json'), '{}')
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
  strictEqual(getNodeModuleFormat(pathToFileURL(join(typelessDirectory, 'module.js')).href), undefined)
  strictEqual(getNodeModuleFormat(pathToFileURL(join(typelessDirectory, 'module.ts')).href), undefined)
  await writeFile(join(formatDirectory, 'package.json'), '{"type":"commonjs"}')
  strictEqual(getNodeModuleFormat(pathToFileURL(join(formatDirectory, 'module.js')).href), 'commonjs')
} finally {
  await rm(formatDirectory, { recursive: true, force: true })
}

strictEqual(getNodeModuleFormat('node:fs'), 'builtin')
strictEqual(getNodeModuleFormat(moduleUrl.replace(/\.mjs$/, '.json')), undefined)

let packageJsonReads = 0
const getCachedNodeModuleFormat = createGetNodeModuleFormat(() => {
  packageJsonReads++
  return '{"type":"module"}'
})
strictEqual(getCachedNodeModuleFormat('file:///cached/one.js'), 'module')
strictEqual(getCachedNodeModuleFormat('file:///cached/two.js'), 'module')
strictEqual(packageJsonReads, 1)

const packageDirectory = await mkdtemp(join(tmpdir(), 'iitm-bundler-package-'))
const packageJsonUrl = pathToFileURL(join(packageDirectory, 'package.json')).href
await writeFile(join(packageDirectory, 'package.json'), JSON.stringify({
  name: '@scope/example',
  type: 'module',
  version: '1.2.3'
}))
await mkdir(join(packageDirectory, 'nested'), { recursive: true })
await writeFile(join(packageDirectory, 'nested/package.json'), '{"type":"commonjs"}')
const packageModuleUrl = pathToFileURL(join(packageDirectory, 'nested/module.js')).href
const expectedPackageDetails = {
  name: '@scope/example',
  packageJsonUrl,
  packageUrl: new URL('.', packageJsonUrl).href,
  path: 'nested/module.js',
  type: 'module',
  version: '1.2.3'
}

deepStrictEqual(getPackageDetails(packageModuleUrl), expectedPackageDetails)
deepStrictEqual(getPackageDetails(`${packageModuleUrl}?loader#fragment`), expectedPackageDetails)
deepStrictEqual(getCommonJSPackageDetails(packageModuleUrl), expectedPackageDetails)
await writeFile(join(packageDirectory, 'package.json'), JSON.stringify({
  name: '@scope/example-renamed',
  type: 'commonjs',
  version: '2.0.0'
}))
const updatedPackageDetails = {
  ...expectedPackageDetails,
  name: '@scope/example-renamed',
  type: 'commonjs',
  version: '2.0.0'
}
deepStrictEqual(getPackageDetails(packageModuleUrl), updatedPackageDetails)
deepStrictEqual(getCommonJSPackageDetails(packageModuleUrl), updatedPackageDetails)
strictEqual(getPackageDetails('node:fs'), undefined)
const noPackageUrl = pathToFileURL(join(tmpdir(), 'iitm-no-package/module.js')).href
strictEqual(getPackageDetails(noPackageUrl), undefined)
strictEqual(getPackageDetails(noPackageUrl), undefined)

const minimalPackageDirectory = await mkdtemp(join(tmpdir(), 'iitm-bundler-minimal-package-'))
const minimalPackageJsonUrl = pathToFileURL(join(minimalPackageDirectory, 'package.json')).href
await writeFile(join(minimalPackageDirectory, 'package.json'), '{"name":"minimal"}')
deepStrictEqual(getPackageDetails(pathToFileURL(join(minimalPackageDirectory, 'module.js')).href), {
  name: 'minimal',
  packageJsonUrl: minimalPackageJsonUrl,
  packageUrl: new URL('.', minimalPackageJsonUrl).href,
  path: 'module.js',
  type: undefined,
  version: undefined
})

const invalidPackageDirectory = await mkdtemp(join(tmpdir(), 'iitm-bundler-invalid-package-'))
await writeFile(join(invalidPackageDirectory, 'package.json'), '{')
throws(
  () => getPackageDetails(pathToFileURL(join(invalidPackageDirectory, 'module.js')).href),
  SyntaxError
)

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

const liveDirectory = await mkdtemp(join(tmpdir(), 'iitm-bundler-live-'))
const liveSource = `export let live = 1
export const stable = 2
export function increment () { live++ }
`
const liveModuleUrl = `data:text/javascript,${encodeURIComponent(liveSource)}`
const liveWrapper = await createWrapperModule({
  module: {
    url: liveModuleUrl,
    format: 'module',
    source: liveSource,
    specifier: 'iitm-live',
    data: { live: true },
    passthroughExports: selectLiveExport
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

match(liveWrapper.code, /export \{ live \} from "\.\/__iitm_module_0__\.js"/)
doesNotMatch(liveWrapper.code, / as live/)

let liveCode = liveWrapper.code
for (const { specifier, target } of liveWrapper.imports) {
  liveCode = liveCode.replaceAll(JSON.stringify(specifier), JSON.stringify(target.url))
}
try {
  const liveWrapperUrl = pathToFileURL(join(liveDirectory, 'wrapper.mjs')).href
  const liveRunnerUrl = pathToFileURL(join(liveDirectory, 'runner.mjs')).href
  await writeFile(new URL(liveWrapperUrl), liveCode)
  await writeFile(new URL(liveRunnerUrl), `import Hook from ${JSON.stringify(new URL('../../index.js', import.meta.url).href)}

let hookedExports
/** @param {Record<string, unknown>} exported The wrapper exports. */
function hookLive (exported) {
  hookedExports = exported
  exported.live = 99
  exported.stable = 43
}

const hook = new Hook(['iitm-live'], hookLive)
const [wrapper, source] = await Promise.all([
  import(${JSON.stringify(liveWrapperUrl)}),
  import(${JSON.stringify(liveModuleUrl)})
])
const initial = [wrapper.live, wrapper.stable, hookedExports.live]
const sameIncrement = wrapper.increment === source.increment
wrapper.increment()
console.log(JSON.stringify({
  initial,
  sameIncrement,
  sourceLive: source.live,
  wrapperLive: wrapper.live,
  hookedLive: hookedExports.live
}))
hook.unhook()
`)
  const result = spawnSync(process.execPath, [fileURLToPath(liveRunnerUrl)], {
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' }
  })
  strictEqual(result.status, 0, result.stderr)
  deepStrictEqual(JSON.parse(result.stdout), {
    initial: [1, 43, 1],
    sameIncrement: true,
    sourceLive: 2,
    wrapperLive: 2,
    hookedLive: 2
  })
} finally {
  await rm(liveDirectory, { recursive: true, force: true })
}

const staticPassthroughWrapper = await createWrapperModule({
  module: {
    url: 'file:///virtual/static-passthrough.mjs',
    format: 'module',
    source: "export { live } from './unresolved.mjs'",
    specifier: './static-passthrough.mjs',
    passthroughExports: 'live'
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})
match(staticPassthroughWrapper.code, /export \{ live \} from "\.\/__iitm_module_0__\.js"/)

await rejects(createWrapperModule({
  module: {
    url: 'file:///virtual/passthrough-error.mjs',
    format: 'module',
    source: 'export const value = 42',
    specifier: './passthrough-error.mjs',
    passthroughExports: unexpectedPassthroughSelection
  },
  resolve: unexpectedIo,
  load: unexpectedIo
}), {
  message: 'Unexpected passthrough export selection'
})

const rebuiltSource = 'export const rebuilt = true'
const rebuiltUrl = `data:text/javascript,${encodeURIComponent(rebuiltSource)}`
const rebuilt = await createWrapperModule({
  module: {
    url: rebuiltUrl,
    format: 'module',
    source: rebuiltSource,
    specifier: 'iitm-rebuilt'
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

match(rebuilt.code, /export \{ \$0 as rebuilt \}/)
match(rebuilt.code, /\nregisterWithData\(/)
doesNotMatch(rebuilt.code, /\nregister\(/)
doesNotMatch(rebuilt.code, /"foo"/)

let rebuiltFormat
/**
 * @param {object} exported
 * @param {string} name
 * @param {string|undefined} baseDir
 * @param {unknown} data
 * @param {string} format
 */
function captureRebuiltFormat (exported, name, baseDir, data, format) {
  strictEqual(exported.rebuilt, true)
  strictEqual(name, 'iitm-rebuilt')
  strictEqual(baseDir, undefined)
  strictEqual(data, undefined)
  rebuiltFormat = format
}
const rebuiltHook = new Hook(['iitm-rebuilt'], captureRebuiltFormat)
try {
  let rebuiltCode = rebuilt.code
  for (const { specifier, target } of rebuilt.imports) {
    rebuiltCode = rebuiltCode.replaceAll(JSON.stringify(specifier), JSON.stringify(target.url))
  }
  await import(`data:text/javascript,${encodeURIComponent(rebuiltCode)}`)
  strictEqual(rebuiltFormat, 'module')
} finally {
  rebuiltHook.unhook()
}

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
    source: '#!/usr/bin/env node\n' +
      'module.exports = { value: 42, argumentsLength: arguments.length }\n' +
      'return\n' +
      'module.exports.unreachable = true',
    specifier: './something.js',
    data: { version: '1.0.0' },
    passthroughExports: unexpectedPassthroughSelection
  }
})

strictEqual(commonJsWrapper.imports.length, 1)
strictEqual(commonJsWrapper.imports[0].kind, 'runtime')
strictEqual(commonJsWrapper.sourceLineOffset, 1)
match(commonJsWrapper.code, /^\(function \(\) \{\n\/\/\/usr\/bin\/env node\n/)
match(commonJsWrapper.code, /registerCommonJS/)
doesNotMatch(commonJsWrapper.code, /^(?:import|export) /m)
doesNotMatch(commonJsWrapper.code, /function \(exports, require, module/)

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
  deepStrictEqual(require(commonJsFilename), { value: 42, argumentsLength: 5, hooked: true })
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
    watchFiles: packageUrl
  }
}

const hookedPackageUrl = new URL('../fixtures/node_modules/some-external-module/index.mjs', import.meta.url).href
let packageBaseDirectory
const packageHook = new Hook(['some-external-module'], (exports, name, baseDir, data) => {
  packageBaseDirectory = baseDir
  deepStrictEqual(data, { version: '2.0.0' })
})
registerModuleWithData(hookedPackageUrl, 'some-external-module', { version: '2.0.0' })
strictEqual(packageBaseDirectory, fileURLToPath(new URL('.', hookedPackageUrl)).slice(0, -1))
packageHook.unhook()

const scopedPackageUrl = new URL(
  '../fixtures/node_modules/@scope/some-scoped-module/index.mjs',
  import.meta.url
).href
let scopedPackageCalls = 0
const scopedPackageHook = new Hook(['@scope/some-scoped-module'], () => {
  scopedPackageCalls++
})
registerModuleWithData(scopedPackageUrl, '@scope/some-scoped-module', undefined)
strictEqual(scopedPackageCalls, 1)
scopedPackageHook.unhook()

const packageInternalUrl = new URL('../fixtures/node_modules/some-external-module/sub.mjs', import.meta.url).href
let packageInternalName
const packageInternalHook = new Hook(['some-external-module'], { internals: true }, (exports, name) => {
  packageInternalName = name
})
registerModuleWithData(packageInternalUrl, 'some-external-module/sub', undefined)
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
strictEqual(commonJsPackageName, undefined)
commonJsPackageHook.unhook()

registerCommonJS(hookedPackageUrl, { exports: {} }, './sub', undefined)
const sameUrlFormats = []

/**
 * @param {object} exports The registered exports.
 * @param {string} name The package name.
 * @param {string|undefined} baseDir The package directory.
 * @param {unknown} data Consumer data associated with the module.
 * @param {'module'|'commonjs'} format The module format.
 */
function captureSameUrlFormat (exports, name, baseDir, data, format) {
  sameUrlFormats.push(format)
}

const sameUrlHook = new Hook(['some-external-module'], captureSameUrlFormat)
deepStrictEqual(sameUrlFormats, ['module'])
sameUrlHook.unhook()

const registerPath = require.resolve('../../lib/register.js')
delete require.cache[registerPath]
const bundledRegister = require(registerPath)
let crossCopyCalls = 0

/**
 * @param {object} exports The module namespace.
 * @param {string} name The package name.
 * @param {string|undefined} baseDir The package directory.
 * @param {unknown} data Consumer data associated with the module.
 * @param {'module'|'commonjs'} format The module format.
 */
function captureCrossCopyRegistration (exports, name, baseDir, data, format) {
  crossCopyCalls++
  strictEqual(name, 'cross-copy-package')
  deepStrictEqual(data, { version: '1.0.0' })
  strictEqual(format, 'module')
}

const crossCopyHook = new Hook(['cross-copy-package'], captureCrossCopyRegistration)
bundledRegister.registerWithData(
  'file:///tmp/node_modules/cross-copy-package/index.mjs',
  new bundledRegister.ModuleBinder({}),
  'cross-copy-package',
  { version: '1.0.0' }
)
strictEqual(crossCopyCalls, 1)
crossCopyHook.unhook()

delete require.cache[registerPath]
const earlyBundledRegister = require(registerPath)
earlyBundledRegister.registerCommonJS(
  'file:///tmp/node_modules/late-cross-copy-package/index.js',
  { exports: {} },
  'late-cross-copy-package',
  { version: '2.0.0' }
)
let lateCrossCopyCalls = 0

/**
 * @param {object} exports The CommonJS exports.
 * @param {string} name The package name.
 * @param {string|undefined} baseDir The package directory.
 * @param {unknown} data Consumer data associated with the module.
 * @param {'module'|'commonjs'} format The module format.
 */
function captureLateCrossCopyRegistration (exports, name, baseDir, data, format) {
  lateCrossCopyCalls++
  strictEqual(name, 'late-cross-copy-package')
  deepStrictEqual(data, { version: '2.0.0' })
  strictEqual(format, 'commonjs')
}

const lateCrossCopyHook = new Hook(['late-cross-copy-package'], captureLateCrossCopyRegistration)
strictEqual(lateCrossCopyCalls, 1)
lateCrossCopyHook.unhook()

let commonJsInternalName
const commonJsInternalHook = new Hook(['some-external-module'], { internals: true }, (exports, name) => {
  commonJsInternalName = name
})
strictEqual(commonJsInternalName, join('some-external-module', 'sub.js'))
commonJsInternalHook.unhook()

const reloadFilename = join(fileURLToPath(new URL('../fixtures/', import.meta.url)), 'reload.cjs')
const reloadUrl = pathToFileURL(reloadFilename).href
registerCommonJS(reloadUrl, { exports: { value: 1 } }, 'reload', undefined)
registerCommonJS(reloadUrl, { exports: { value: 2 } }, 'reload', undefined)
registerCommonJS(reloadUrl, { exports: { value: 3 } }, 'reload', undefined)
registerModuleWithData(reloadUrl, 'reload', undefined)
const reloadCalls = []
/**
 * @param {{ value?: number }} exports The latest module exports.
 * @param {string} name The canonical module URL.
 * @param {string|undefined} baseDir The package directory.
 * @param {unknown} data Consumer data associated with the module.
 * @param {'module'|'commonjs'} format The module format.
 */
function captureReloadedValue (exports, name, baseDir, data, format) {
  reloadCalls.push({ format, value: exports.value })
}
const reloadHook = new Hook([reloadFilename], captureReloadedValue)
deepStrictEqual(reloadCalls, [
  { format: 'commonjs', value: 3 },
  { format: 'module', value: undefined }
])
reloadHook.unhook()

let invalidFileUrlName
const invalidFileUrlHook = new Hook((exports, name) => {
  invalidFileUrlName = name
})
invalidFileUrlName = undefined
registerModuleWithData('file://%', 'invalid', undefined)
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
    watchFiles: sourceWatchUrl
  }
}

const reexportUrl = new URL('../fixtures/reexport-same-source.mjs', import.meta.url).href
const reexportWrapper = await createWrapperModule({
  module: {
    url: reexportUrl,
    format: 'module',
    specifier: './reexport-same-source.mjs',
    passthroughExports: selectValExport
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
match(reexportWrapper.code, /export \{ val \} from "\.\/__iitm_module_1__\.js"/)

const repeatedReexportUrl = 'file:///virtual/repeated-reexport.mjs'
const repeatedLeafUrl = 'file:///virtual/repeated-reexport-leaf.mjs'
let repeatedResolveCalls = 0
/**
 * @param {string} specifier
 * @param {{ parentURL: string }} context
 */
function resolveRepeatedReexport (specifier, context) {
  strictEqual(specifier, repeatedLeafUrl)
  strictEqual(context.parentURL, repeatedReexportUrl)
  repeatedResolveCalls++
  return { url: repeatedLeafUrl, format: 'module' }
}

/**
 * @param {string} url
 */
function loadRepeatedReexport (url) {
  strictEqual(url, repeatedLeafUrl)
  return { format: 'module', source: 'export const first = 1, second = 2, third = 3' }
}

/**
 * @param {ReadonlyArray<{ name: string }>} exports The resolved exports.
 */
function selectRepeatedExports (exports) {
  return exports.map(({ name }) => name)
}

await createWrapperModule({
  module: {
    url: repeatedReexportUrl,
    format: 'module',
    source: "export { first, second, third } from './repeated-reexport-leaf.mjs'",
    specifier: 'repeated-reexport',
    passthroughExports: selectRepeatedExports
  },
  resolve: resolveRepeatedReexport,
  load: loadRepeatedReexport
})
strictEqual(repeatedResolveCalls, 1)

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

match(commonJsReexportWrapper.code, /export \{ \$0 as foo(?:,| \})/)
if (parseInt(process.versions.node, 10) >= 23) {
  match(commonJsReexportWrapper.code, /as "module\.exports"/)
} else {
  doesNotMatch(commonJsReexportWrapper.code, /as "module\.exports"/)
}
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

match(quotedExportWrapper.code, /export \{ \$0 as "quoted name" \}/)

const quotedPassthroughWrapper = await createWrapperModule({
  module: {
    url: 'file:///virtual/quoted-passthrough.mjs',
    format: 'module',
    source: 'const value = 42; export { value as "quoted name" }',
    specifier: './quoted-passthrough.mjs',
    passthroughExports: ['quoted name', 'missing']
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

match(quotedPassthroughWrapper.code, /export \{ "quoted name" \} from "\.\/__iitm_module_0__\.js"/)
doesNotMatch(quotedPassthroughWrapper.code, /missing/)

const defaultPassthroughWrapper = await createWrapperModule({
  module: {
    url: 'file:///virtual/default-passthrough.mjs',
    format: 'module',
    source: 'export default 42',
    specifier: './default-passthrough.mjs',
    passthroughExports: ['default']
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

match(defaultPassthroughWrapper.code, /export \{ default \} from "\.\/__iitm_module_0__\.js"/)

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
