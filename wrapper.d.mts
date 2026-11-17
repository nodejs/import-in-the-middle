/**
 * EXPERIMENTAL: not covered by semantic versioning. This API may change or
 * be removed in any release, including patch releases, without a
 * deprecation period.
 *
 * Context passed to {@link CreateWrapperModuleOptions.resolve}.
 */
export type WrapperResolveContext = {
  /** URL of the module declaring the re-export. */
  parentURL: string
  /**
   * `import` for an ESM `export * from`, `require` for a CommonJS re-export
   * (`.json` and `.node` targets are resolved, then skipped without `load`).
   * Either way the specifier arrives as written, such as `./lib`, `pkg` or
   * `#internal`, to be resolved against `parentURL`.
   */
  kind: 'import' | 'require'
}

export type WrapperResolveResult = {
  /** Canonical absolute URL of the resolved module. Builtins are `node:` URLs. */
  url: string
  /**
   * Loader format (`module`, `commonjs`, ...), used unless `load` overrides
   * it. Only a `node:` URL may be, and always is, `builtin`.
   */
  format?: string | undefined
}

/** JavaScript source. Byte input is decoded as UTF-8. */
export type WrapperSource = string | ArrayBuffer | ArrayBufferView

/** Context passed to {@link CreateWrapperModuleOptions.load}. */
export type WrapperLoadContext = {
  /** The format reported by `resolve`, when known. */
  format?: string
}

export type WrapperLoadResult = {
  /** Module source. Required; IITM never reads the filesystem for it. */
  source: WrapperSource
  /**
   * Loader format, overriding `resolve` when provided. Only when neither
   * adapter supplies a format is ESM syntax treated as ESM and anything else
   * as CommonJS. Builtins never reach `load`, so `builtin` is rejected.
   */
  format?: string | undefined
}

/**
 * One import of the generated facade. The facade imports only `specifier`, a
 * relative placeholder, and the caller resolves it to `url` according to
 * `kind`:
 *
 * - `runtime`: IITM's registration runtime (`lib/register.js` of this copy).
 *   It must load the same instance that `Hook`/`addHook` use. Its URL is
 *   computed from the location of `wrapper/create-wrapper.mjs`, so keep
 *   `import-in-the-middle` external when bundling the calling tool.
 * - `original`: the wrapped module itself. It must load the original,
 *   unwrapped module: resolving it back to the facade makes the facade import
 *   itself.
 * - `module`: the defining module of a re-exported name. Resolve it normally,
 *   to the instance the wrapped module's own `export *` chain uses, or it is
 *   evaluated twice.
 *
 * Builtins have the format `builtin`; a bundler leaves them external.
 */
export type WrapperImport = {
  /** Placeholder emitted in `code`, such as `./__iitm_module_0__.js`. */
  specifier: string
  kind: 'runtime' | 'original' | 'module'
  /** Canonical absolute URL: IITM's runtime, the wrapped `url` or a resolved module URL. */
  url: string
  /**
   * Effective loader format, when known: `load`'s, else `resolve`'s, `builtin`
   * for builtins, `commonjs` for the runtime.
   */
  format?: string
}

/** The generated facade and the imports a caller resolves for it. */
export type WrapperModule = {
  /**
   * ESM source of the facade, importing only the placeholders in `imports`.
   * Evaluating it registers the module, so it has side effects.
   */
  code: string
  /**
   * One entry per placeholder: the runtime, then the original, then any
   * defining modules. `code` is not self-contained: cache `imports` with it.
   */
  imports: WrapperImport[]
}

type CreateWrapperModuleBaseOptions = {
  /**
   * Canonical absolute URL of the wrapped module: its registration identity
   * for `Hook`/`addHook` and the `parentURL` of its re-exports. It must be the
   * exact string `resolve` returns for the module, so the graph recognizes it.
   * The facade's placeholders never change it.
   */
  url: string
  /** The specifier the module was imported by, reported to hooks. */
  specifier: string
}

// Adapters are optional, and `undefined` counts as omitted, also under
// `exactOptionalPropertyTypes`.
type WrapperSyncAdapters = {
  /** Required only when analysis encounters a star or CommonJS re-export. */
  resolve?: ((specifier: string, context: WrapperResolveContext) => WrapperResolveResult) | undefined
  /** Required only when analysis encounters a star or CommonJS re-export of a non-builtin. */
  load?: ((url: string, context: WrapperLoadContext) => WrapperLoadResult) | undefined
}

type WrapperAsyncAdapters = {
  /** Required only when analysis encounters a star or CommonJS re-export. */
  resolve?: ((specifier: string, context: WrapperResolveContext) => WrapperResolveResult | PromiseLike<WrapperResolveResult>) | undefined
  /** Required only when analysis encounters a star or CommonJS re-export of a non-builtin. */
  load?: ((url: string, context: WrapperLoadContext) => WrapperLoadResult | PromiseLike<WrapperLoadResult>) | undefined
}

/** The module to wrap: ESM source the caller provides, or a builtin. */
type WrapperRoot<Adapters> = CreateWrapperModuleBaseOptions & Adapters & (
  | {
      /**
       * The module's ESM JavaScript source; `load` is never called for this
       * URL. Byte input is decoded as UTF-8. The caller transpiles
       * TypeScript/JSX and decides that the module is ESM; IITM does not infer
       * it.
       */
      source: WrapperSource
    }
  | {
      /**
       * A Node.js builtin, as a `node:` URL (`node:fs`, not `fs`). Its exports
       * come from the builtin itself, so no source is given and the adapters
       * are never called. A `node:` URL given with `source` also matches the
       * branch above, so only the runtime rejects it.
       */
      url: `node:${string}`
      source?: undefined
    }
)

/** Options of {@link createWrapperModule}: adapters may return Promises. */
export type CreateWrapperModuleOptions = WrapperRoot<WrapperAsyncAdapters>

/** Options of {@link createWrapperModuleSync}: adapters must return synchronously. */
export type CreateWrapperModuleSyncOptions = WrapperRoot<WrapperSyncAdapters>

/**
 * EXPERIMENTAL: not covered by semantic versioning. This API may change or
 * be removed in any release, including patch releases, without a
 * deprecation period.
 *
 * Generates an IITM ESM facade for a caller-selected ESM module, using
 * caller-provided source and module-graph access, or for a Node.js builtin
 * given as a `node:` URL, without installing IITM's loader hooks. The facade
 * imports the original module and the registration runtime through relative
 * placeholders listed in `imports`, re-exports the module's bindings, and
 * registers it with `Hook`/`addHook` under `url`.
 *
 * `resolve` and `load` are required only when analysis needs them; a missing
 * adapter fails with context when first needed.
 *
 * Invalid options and adapter failures reject the returned Promise.
 *
 * ```js
 * const { code, imports } = await createWrapperModule({ url, source, specifier, resolve, load })
 * const leaf = await createWrapperModule({ url, source: 'export const a = 1', specifier })
 * const builtin = await createWrapperModule({ url: 'node:http', specifier: 'http' })
 * ```
 */
export declare function createWrapperModule (options: CreateWrapperModuleOptions): Promise<WrapperModule>

/**
 * EXPERIMENTAL: not covered by semantic versioning. This API may change or
 * be removed in any release, including patch releases, without a
 * deprecation period.
 *
 * Synchronous {@link createWrapperModule}, for synchronous hooks such as
 * `module.registerHooks()`. `resolve` and `load` must return synchronously.
 */
export declare function createWrapperModuleSync (options: CreateWrapperModuleSyncOptions): WrapperModule
