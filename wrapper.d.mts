/**
 * EXPERIMENTAL: this API may change in minor versions.
 *
 * Context passed to {@link CreateWrapperModuleOptions.resolve}.
 */
export type WrapperResolveContext = {
  /** URL of the module declaring the re-export. */
  parentURL: string
  /**
   * `import` for an ESM `export * from` (relative specifiers arrive already
   * joined against `parentURL` as absolute URLs), `require` for a CommonJS
   * re-export (the specifier arrives as written, e.g. `./lib` or `#internal`;
   * `.json` and `.node` targets are resolved, then skipped without `load`).
   */
  kind: 'import' | 'require'
}

export type WrapperResolveResult = {
  /**
   * Canonical absolute URL of the resolved module. Use a `node:` URL for
   * builtins. A module with relative re-exports needs a hierarchical URL, such
   * as `file:`, to resolve them against.
   */
  url: string
  /** Loader format (`module`, `commonjs`, `builtin`, ...), used unless `load` overrides it. */
  format?: string
}

/** Context passed to {@link CreateWrapperModuleOptions.load}. */
export type WrapperLoadContext = {
  /** The format reported by `resolve`, when known. */
  format?: string
}

export type WrapperLoadResult = {
  /** Module source. Required; IITM never reads the filesystem for it. */
  source: string | ArrayBuffer | ArrayBufferView
  /**
   * Loader format, overriding `resolve` when provided. When omitted, the
   * resolved format is retained. Only when neither adapter supplies a format
   * is ESM syntax treated as ESM and anything else as CommonJS. Builtins never
   * reach `load`, so `builtin` is rejected.
   */
  format?: string
}

/**
 * Maps a canonical URL to the specifier the facade imports.
 *
 * - `module`: a module the facade reads bindings from (the wrapped module, or
 *   the defining module of a re-exported name). It must load the original,
 *   unwrapped module; returning a specifier that resolves back to the facade
 *   makes the facade import itself.
 * - `runtime`: IITM's registration runtime (`lib/register.js` of this copy).
 *   It must load the same instance that `Hook`/`addHook` use. Its URL is
 *   computed from the location of `wrapper.mjs`, so keep
 *   `import-in-the-middle` external when bundling the calling tool.
 *
 * Called synchronously while generating the facade, possibly more than once for
 * the same URL; it must be deterministic. The returned string is escaped by IITM.
 */
export type WrapperMapImport = (url: string, kind: 'module' | 'runtime') => string

type CreateWrapperModuleBaseOptions = {
  /** The specifier the module was imported by, reported to hooks. */
  specifier: string
  /** Defaults to the identity mapping. See {@link WrapperMapImport}. */
  mapImport?: WrapperMapImport
}

type WrapperSyncAdapters = {
  resolve: (specifier: string, context: WrapperResolveContext) => WrapperResolveResult
  load: (url: string, context: WrapperLoadContext) => WrapperLoadResult
}

type WrapperAsyncAdapters = {
  resolve: (specifier: string, context: WrapperResolveContext) => WrapperResolveResult | PromiseLike<WrapperResolveResult>
  load: (url: string, context: WrapperLoadContext) => WrapperLoadResult | PromiseLike<WrapperLoadResult>
}

/** The module to wrap: ESM source the caller provides, or a builtin. */
type WrapperRoot<Adapters> =
  | ({
      /**
       * Canonical URL of the wrapped module: its registration identity for
       * `Hook`/`addHook` and the base for resolving its re-exports, so it must
       * be hierarchical (such as `file:`) when the module has relative
       * re-exports. Not changed by `mapImport`.
       */
      url: string
      /**
       * The module's ESM JavaScript source. The caller decodes bytes,
       * transpiles TypeScript/JSX and decides that the module is ESM; IITM does
       * not infer it.
       */
      source: string
    } & Adapters)
  | ({
      /**
       * A Node.js builtin, as a `node:` URL (`node:fs`, not `fs`). Its exports
       * come from the builtin itself, so no source is given and the adapters,
       * which a builtin never needs, are optional.
       */
      url: `node:${string}`
      source?: undefined
    } & Partial<Adapters>)

export type CreateWrapperModuleSyncOptions = CreateWrapperModuleBaseOptions & {
  /** Generate synchronously. Every adapter must return synchronously. */
  sync: true
} & WrapperRoot<WrapperSyncAdapters>

export type CreateWrapperModuleAsyncOptions = CreateWrapperModuleBaseOptions & {
  sync?: false
} & WrapperRoot<WrapperAsyncAdapters>

export type CreateWrapperModuleOptions = CreateWrapperModuleBaseOptions & {
  /** Chosen at runtime, so the adapters must be synchronous. */
  sync: boolean
} & WrapperRoot<WrapperSyncAdapters>

/**
 * EXPERIMENTAL: this API may change in minor versions.
 *
 * Generates an IITM-style ESM facade for a caller-selected ESM module, using
 * caller-provided source and module-graph access, or for a Node.js builtin
 * given as a `node:` URL, without installing IITM's loader hooks. The facade
 * imports the original module and the registration runtime through
 * `mapImport`, re-exports the module's bindings, and registers it with
 * `Hook`/`addHook` under `url`.
 *
 * Returns a `Promise<string>` by default. With `sync: true` it returns a
 * `string` and every adapter must return synchronously; a Promise from an
 * adapter throws a `TypeError`.
 *
 * ```js
 * const code = await createWrapperModule({ url, source, specifier, resolve, load, mapImport })
 * const codeSync = createWrapperModule({ url, source, specifier, resolve, load, mapImport, sync: true })
 * const builtin = createWrapperModule({ url: 'node:http', specifier: 'http', sync: true })
 * ```
 */
export declare function createWrapperModule (options: CreateWrapperModuleSyncOptions): string
export declare function createWrapperModule (options: CreateWrapperModuleAsyncOptions): Promise<string>
export declare function createWrapperModule (options: CreateWrapperModuleOptions): string | Promise<string>
