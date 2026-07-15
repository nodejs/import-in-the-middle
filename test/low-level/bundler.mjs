import { strictEqual, deepStrictEqual, match, doesNotMatch } from 'assert'
import { readFile, mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'

import Hook from '../../index.js'
import { createWrapperModule } from '../../bundler.mjs'

const moduleUrl = new URL('../fixtures/something.mjs', import.meta.url).href
const source = await readFile(new URL(moduleUrl), 'utf8')

/**
 * @returns {never}
 */
function unexpectedIo () {
  throw new Error('I/O should not be used when source is provided')
}

const wrapper = await createWrapperModule({
  module: {
    url: moduleUrl,
    format: 'module',
    source,
    specifier: './something.mjs'
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
match(wrapper.code, /__binder\.register\(\)/)
doesNotMatch(wrapper.code, /from "file:/)

/**
 * @param {object} exported
 */
function hookFoo (exported) {
  exported.foo = 43
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

match(rebuilt.code, /export \{ \$rebuilt as "rebuilt" \}/)
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
    source: await readFile(new URL(commonJsUrl), 'utf8'),
    specifier: './something.js'
  },
  resolve: unexpectedIo,
  load: unexpectedIo
})

match(commonJsWrapper.code, /export \{ \$foo as "foo" \}/)
match(commonJsWrapper.code, /export \{ \$default as default \}/)

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

match(commonJsReexportWrapper.code, /export \{ \$foo as "foo" \}/)
doesNotMatch(commonJsReexportWrapper.code, /as default/)

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
