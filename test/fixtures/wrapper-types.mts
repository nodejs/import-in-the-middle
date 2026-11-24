import {
  createWrapperModule,
  createWrapperModuleSync,
  type CreateWrapperModuleOptions,
  type CreateWrapperModuleSyncOptions,
  type WrapperImport,
  type WrapperModule,
  type WrapperSource,
  type WrapperResolveResult,
  type WrapperLoadResult
} from 'import-in-the-middle/wrapper.mjs'

const base = { url: 'file:///a.mjs', source: '', specifier: 'a' }
const rs = (): WrapperResolveResult => ({ url: 'file:///b.mjs' })
const ls = (): WrapperLoadResult => ({ source: '' })
const ra = async (): Promise<WrapperResolveResult> => ({ url: 'file:///b.mjs' })
const la = async (): Promise<WrapperLoadResult> => ({ source: '' })

const s: WrapperModule = createWrapperModuleSync({ ...base, resolve: rs, load: ls })
const p1: Promise<WrapperModule> = createWrapperModule({ ...base, resolve: ra, load: la })
const p2: Promise<WrapperModule> = createWrapperModule({ ...base, resolve: rs, load: ls })
const b1: WrapperModule = createWrapperModuleSync({ url: 'node:http', specifier: 'http' })
const b2: Promise<WrapperModule> = createWrapperModule({ url: 'node:http', specifier: 'http' })
const b3: Promise<WrapperModule> = createWrapperModule({ url: 'node:http', specifier: 'http', resolve: ra, load: la })
const syncOptions: CreateWrapperModuleSyncOptions = { ...base, resolve: rs, load: ls }
const asyncOptions: CreateWrapperModuleOptions = syncOptions
const leaf: WrapperModule = createWrapperModuleSync(base)
const asyncLeaf: Promise<WrapperModule> = createWrapperModule(base)
const resolvedOnly: WrapperModule = createWrapperModuleSync({ ...base, resolve: rs })
const loadedOnly: Promise<WrapperModule> = createWrapperModule({ ...base, load: la })
// An explicit `undefined` adapter counts as omitted, also under
// `exactOptionalPropertyTypes`.
declare const maybeResolve: typeof rs | undefined
declare const maybeLoad: typeof la | undefined
createWrapperModuleSync({ ...base, resolve: maybeResolve, load: undefined })
createWrapperModule({ ...base, resolve: undefined, load: maybeLoad })

const sources: WrapperSource[] = ['', new ArrayBuffer(0), new Uint8Array(0), new DataView(new ArrayBuffer(0))]
for (const source of sources) {
  createWrapperModuleSync({ ...base, source })
  createWrapperModule({ ...base, source })
}

// Optional callbacks retain contextual parameter types.
createWrapperModuleSync({
  ...base,
  resolve(specifier, { parentURL, kind }) {
    const k: 'import' | 'require' = kind
    return { url: new URL(specifier, parentURL).href, format: k === 'import' ? 'module' : 'commonjs' }
  },
  load(url, { format }) {
    const u: string = url
    return { source: new Uint8Array(u.length), format }
  }
})

const code: string = s.code
const first: WrapperImport | undefined = s.imports[0]
const kind: 'runtime' | 'original' | 'module' | undefined = first?.kind
const url: string | undefined = first?.url
const format: string | undefined = first?.format
const placeholder: string | undefined = first?.specifier

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
const exactKind: Equal<WrapperImport['kind'], 'runtime' | 'original' | 'module'> = true

// @ts-expect-error async resolve in createWrapperModuleSync
createWrapperModuleSync({ ...base, resolve: ra, load: ls })
// @ts-expect-error async load in createWrapperModuleSync
createWrapperModuleSync({ ...base, resolve: rs, load: la })
// @ts-expect-error createWrapperModuleSync does not return a Promise
const bad: Promise<WrapperModule> = createWrapperModuleSync({ ...base, resolve: rs, load: ls })
// @ts-expect-error createWrapperModule does not return a result object
const bad2: WrapperModule = createWrapperModule({ ...base, resolve: rs, load: ls })
// @ts-expect-error the result is not a string
const bad3: string = createWrapperModuleSync({ ...base, resolve: rs, load: ls })
// @ts-expect-error source is required for a non-builtin
createWrapperModuleSync({ url: 'file:///a.mjs', specifier: 'a', resolve: rs, load: ls })
// @ts-expect-error source is required for a non-builtin
createWrapperModule({ url: 'file:///a.mjs', specifier: 'a', resolve: ra, load: la })
// @ts-expect-error mapImport was replaced by the imports manifest
createWrapperModuleSync({ ...base, resolve: rs, load: ls, mapImport: (u: string) => u })

// @ts-expect-error only a node: URL may omit source
createWrapperModuleSync({ url: 'file:///a.mjs', specifier: 'a' })
// @ts-expect-error only a node: URL may omit source
createWrapperModule({ url: 'file:///a.mjs', specifier: 'a' })
// @ts-expect-error async adapters for a builtin in createWrapperModuleSync
createWrapperModuleSync({ url: 'node:http', specifier: 'http', resolve: ra })
// @ts-expect-error source may not be undefined for a non-builtin
createWrapperModuleSync({ ...base, source: undefined, load: ls })
// @ts-expect-error source must be JavaScript text or bytes
createWrapperModuleSync({ ...base, source: 42 })
// @ts-expect-error optional does not allow non-function adapters
createWrapperModuleSync({ ...base, resolve: null })
// A `node:` url given with `source` and adapters still type-checks against the
// non-builtin branch (TypeScript cannot exclude a `node:` prefix from `string`);
// only the runtime rejects it, which test/wrapper/errors.mjs covers.

// @ts-expect-error watchFiles was removed
s.watchFiles.length
// @ts-expect-error sideEffects was removed
s.sideEffects.valueOf()
// @ts-expect-error imports entries are flat
first?.target

export {
  s, p1, p2, b1, b2, b3, syncOptions, asyncOptions, bad, bad2, bad3,
  leaf, asyncLeaf, resolvedOnly, loadedOnly,
  code, kind, url, format, placeholder, exactKind
}
