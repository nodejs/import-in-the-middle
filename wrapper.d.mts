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
  /**
   * Extra files the facade depends on (for example a `package.json` consulted
   * during resolution), as absolute URLs. Added to {@link WrapperModule.watchFiles}.
   */
  watchFiles?: Iterable<string>
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
  /**
   * Extra files the facade depends on, as absolute URLs. Added to
   * {@link WrapperModule.watchFiles}.
   */
  watchFiles?: Iterable<string>
}

/** A module the facade imports, identified by its canonical URL. */
export type WrapperModuleTarget = {
  /** Canonical absolute URL: a resolved module URL, a `node:` URL or IITM's runtime. */
  url: string
  /** Loader format reported by the adapters, `builtin` for builtins, `commonjs` for the runtime. */
  format?: string
}

/**
 * One import of the generated facade. The facade imports only `specifier`, a
 * relative placeholder; the caller resolves it to `target`.
 *
 * - `module`: a module the facade reads bindings from. The first one
 *   (`./__iitm_module_0__.js`, whose `target.url` is the wrapped `url`) is the
 *   wrapped module: it must load the original, unwrapped module, since
 *   resolving it back to the facade makes the facade import itself. Any other
 *   is the defining module of a re-exported name: resolve it normally, to the
 *   instance the wrapped module's own `export *` chain uses, or it is
 *   evaluated twice.
 * - `runtime`: IITM's registration runtime (`lib/register.js` of this copy).
 *   It must load the same instance that `Hook`/`addHook` use. Its URL is
 *   computed from the location of `wrapper.mjs`, so keep
 *   `import-in-the-middle` external when bundling the calling tool.
 */
export type WrapperImport = {
  /** Placeholder emitted in `code`, such as `./__iitm_module_0__.js`. */
  specifier: string
  kind: 'module' | 'runtime'
  target: WrapperModuleTarget
  /** `true` for builtins, which a bundler should leave external. */
  external: boolean
}

/** The generated facade and what a caller needs to resolve and rebuild it. */
export type WrapperModule = {
  /** ESM source of the facade, importing only the placeholders in `imports`. */
  code: string
  /**
   * One entry per placeholder, the runtime first, then the wrapped module.
   * `code` is not self-contained: cache `imports` together with it.
   */
  imports: WrapperImport[]
  /**
   * Deduplicated absolute URLs whose change can change `code`: every analyzed
   * `file:` module, including the root, plus the adapters' `watchFiles`.
   */
  watchFiles: string[]
  /** The facade registers the module with `Hook`/`addHook` when evaluated. */
  sideEffects: true
}

type CreateWrapperModuleBaseOptions = {
  /** The specifier the module was imported by, reported to hooks. */
  specifier: string
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
       * re-exports. The facade's placeholders never change it.
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
 * imports the original module and the registration runtime through relative
 * placeholders listed in `imports`, re-exports the module's bindings, and
 * registers it with `Hook`/`addHook` under `url`.
 *
 * Returns a `Promise<WrapperModule>` by default. With `sync: true` it returns a
 * `WrapperModule` and every adapter must return synchronously; a Promise from
 * an adapter throws a `TypeError`.
 *
 * ```js
 * const { code, imports, watchFiles } = await createWrapperModule({ url, source, specifier, resolve, load })
 * const wrapperSync = createWrapperModule({ url, source, specifier, resolve, load, sync: true })
 * const builtin = createWrapperModule({ url: 'node:http', specifier: 'http', sync: true })
 * ```
 */
export declare function createWrapperModule (options: CreateWrapperModuleSyncOptions): WrapperModule
export declare function createWrapperModule (options: CreateWrapperModuleAsyncOptions): Promise<WrapperModule>
export declare function createWrapperModule (options: CreateWrapperModuleOptions): WrapperModule | Promise<WrapperModule>
