import {
  createWrapperModule,
  type WrapperImport,
  type WrapperModule,
  type WrapperResolveResult,
  type WrapperLoadResult
} from 'import-in-the-middle/wrapper.mjs'

const base = { url: 'file:///a.mjs', source: '', specifier: 'a' }
const rs = (): WrapperResolveResult => ({ url: 'file:///b.mjs' })
const ls = (): WrapperLoadResult => ({ source: '' })
const ra = async (): Promise<WrapperResolveResult> => ({ url: 'file:///b.mjs', watchFiles: ['file:///package.json'] })
const la = async (): Promise<WrapperLoadResult> => ({ source: '', watchFiles: new Set(['file:///b.mjs']) })

const s: WrapperModule = createWrapperModule({ ...base, resolve: rs, load: ls, sync: true })
const p1: Promise<WrapperModule> = createWrapperModule({ ...base, resolve: ra, load: la })
const p2: Promise<WrapperModule> = createWrapperModule({ ...base, resolve: rs, load: ls, sync: false })
declare const flag: boolean
const u: WrapperModule | Promise<WrapperModule> = createWrapperModule({ ...base, resolve: rs, load: ls, sync: flag })
const b1: WrapperModule = createWrapperModule({ url: 'node:http', specifier: 'http', sync: true })
const b2: Promise<WrapperModule> = createWrapperModule({ url: 'node:http', specifier: 'http' })
const b3: Promise<WrapperModule> = createWrapperModule({ url: 'node:http', specifier: 'http', resolve: ra, load: la })
const b4: WrapperModule | Promise<WrapperModule> = createWrapperModule({ url: 'node:http', specifier: 'http', sync: flag })

const code: string = s.code
const watchFiles: string[] = s.watchFiles
const sideEffects: true = s.sideEffects
const first: WrapperImport | undefined = s.imports[0]
const kind: 'module' | 'runtime' | undefined = first?.kind
const targetUrl: string | undefined = first?.target.url
const targetFormat: string | undefined = first?.target.format
const external: boolean | undefined = first?.external
const placeholder: string | undefined = first?.specifier

// @ts-expect-error async resolve in sync mode
createWrapperModule({ ...base, resolve: ra, load: ls, sync: true })
// @ts-expect-error async load in sync mode
createWrapperModule({ ...base, resolve: rs, load: la, sync: true })
// @ts-expect-error sync mode does not return a Promise
const bad: Promise<WrapperModule> = createWrapperModule({ ...base, resolve: rs, load: ls, sync: true })
// @ts-expect-error async mode does not return a result object
const bad2: WrapperModule = createWrapperModule({ ...base, resolve: ra, load: la })
// @ts-expect-error the result is not a string
const bad3: string = createWrapperModule({ ...base, resolve: rs, load: ls, sync: true })
// @ts-expect-error a runtime boolean requires synchronous adapters
createWrapperModule({ ...base, resolve: ra, load: la, sync: flag })
// @ts-expect-error source is required
createWrapperModule({ url: 'file:///a.mjs', specifier: 'a', resolve: rs, load: ls, sync: true })
// @ts-expect-error watchFiles are strings
createWrapperModule({ ...base, resolve: () => ({ url: 'file:///b.mjs', watchFiles: [1] }), load: ls, sync: true })
// @ts-expect-error mapImport was replaced by the imports manifest
createWrapperModule({ ...base, resolve: rs, load: ls, sync: true, mapImport: (u: string) => u })

// @ts-expect-error only a node: URL may omit source and adapters
createWrapperModule({ url: 'file:///a.mjs', specifier: 'a', sync: true })
// @ts-expect-error async adapters for a builtin in sync mode
createWrapperModule({ url: 'node:http', specifier: 'http', resolve: ra, sync: true })
// @ts-expect-error a builtin takes no source
createWrapperModule({ url: 'node:http', specifier: 'http', source: 1, sync: true })

export {
  s, p1, p2, u, bad, bad2, bad3, b1, b2, b3, b4,
  code, watchFiles, sideEffects, kind, targetUrl, targetFormat, external, placeholder
}
