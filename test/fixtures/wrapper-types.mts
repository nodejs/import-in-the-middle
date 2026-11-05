import {
  createWrapperModule,
  type WrapperResolveResult,
  type WrapperLoadResult
} from 'import-in-the-middle/wrapper.mjs'

const base = { url: 'file:///a.mjs', source: '', specifier: 'a' }
const rs = (): WrapperResolveResult => ({ url: 'file:///b.mjs' })
const ls = (): WrapperLoadResult => ({ source: '' })
const ra = async (): Promise<WrapperResolveResult> => ({ url: 'file:///b.mjs' })
const la = async (): Promise<WrapperLoadResult> => ({ source: '' })

const s: string = createWrapperModule({ ...base, resolve: rs, load: ls, sync: true })
const p1: Promise<string> = createWrapperModule({ ...base, resolve: ra, load: la })
const p2: Promise<string> = createWrapperModule({ ...base, resolve: rs, load: ls, sync: false })
const p3: Promise<string> = createWrapperModule({
  ...base,
  resolve: rs,
  load: la,
  mapImport: (u, k) => k === 'runtime' ? './rt.js' : u
})
declare const flag: boolean
const u: string | Promise<string> = createWrapperModule({ ...base, resolve: rs, load: ls, sync: flag })
const b1: string = createWrapperModule({ url: 'node:http', specifier: 'http', sync: true })
const b2: Promise<string> = createWrapperModule({ url: 'node:http', specifier: 'http' })
const b3: Promise<string> = createWrapperModule({ url: 'node:http', specifier: 'http', resolve: ra, load: la })
const b4: string | Promise<string> = createWrapperModule({ url: 'node:http', specifier: 'http', sync: flag })

// @ts-expect-error async resolve in sync mode
createWrapperModule({ ...base, resolve: ra, load: ls, sync: true })
// @ts-expect-error async load in sync mode
createWrapperModule({ ...base, resolve: rs, load: la, sync: true })
// @ts-expect-error sync mode does not return a Promise
const bad: Promise<string> = createWrapperModule({ ...base, resolve: rs, load: ls, sync: true })
// @ts-expect-error async mode does not return a string
const bad2: string = createWrapperModule({ ...base, resolve: ra, load: la })
// @ts-expect-error a runtime boolean requires synchronous adapters
createWrapperModule({ ...base, resolve: ra, load: la, sync: flag })
// @ts-expect-error source is required
createWrapperModule({ url: 'file:///a.mjs', specifier: 'a', resolve: rs, load: ls, sync: true })
// @ts-expect-error mapImport must return a string synchronously
createWrapperModule({ ...base, resolve: rs, load: ls, sync: true, mapImport: async (u: string) => u })

// @ts-expect-error only a node: URL may omit source and adapters
createWrapperModule({ url: 'file:///a.mjs', specifier: 'a', sync: true })
// @ts-expect-error async adapters for a builtin in sync mode
createWrapperModule({ url: 'node:http', specifier: 'http', resolve: ra, sync: true })
// @ts-expect-error a builtin takes no source
createWrapperModule({ url: 'node:http', specifier: 'http', source: 1, sync: true })

export { s, p1, p2, p3, u, bad, bad2, b1, b2, b3, b4 }
