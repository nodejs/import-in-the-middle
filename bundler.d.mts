export type WrapperSource = string | ArrayBuffer | ArrayBufferView

export type PackageDetails = {
  name: string
  packageJsonUrl: string
  packageUrl: string
  path: string
  type?: string
  version?: string
}

export type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type JsonCompatible<Value> =
  Value extends boolean | null | number | string
    ? Value
    : Value extends readonly unknown[]
      ? { [Key in keyof Value]: JsonCompatible<Value[Key]> }
      : Value extends object
        ? { [Key in keyof Value]: JsonCompatible<Value[Key]> }
        : never

export type WrapperExport = {
  name: string
  url: string
  localName?: string
}

export type PassthroughExports =
  | Iterable<string>
  | ((exports: readonly WrapperExport[]) => Iterable<string>)

export type BundlerModule<Data = JsonValue> = {
  url: string
  format?: string
  specifier: string
  source?: WrapperSource
  data?: JsonCompatible<Data>
  passthroughExports?: PassthroughExports
}

export type ModuleContext = {
  format?: string
  parentURL?: string
}

export type ResolveContext = ModuleContext & {
  parentURL: string
}

export type ModuleTarget = {
  url: string
  format?: string
}

export type ResolveResult = ModuleTarget & {
  watchFiles?: Iterable<string>
}

export type LoadResult = {
  source?: WrapperSource
  format?: string
  watchFiles?: Iterable<string>
}

export type WrapperImport = {
  specifier: string
  kind: 'module' | 'runtime'
  target: ModuleTarget
  external: boolean
}

export type WrapperModule = {
  code: string
  imports: WrapperImport[]
  watchFiles: string[]
  sideEffects: true
  sourceLineOffset?: number
}

type CommonJSFormat = 'commonjs' | 'commonjs-typescript'

type Resolve = (
  specifier: string,
  context: ResolveContext
) => ResolveResult | Promise<ResolveResult>

type Load = (
  url: string,
  context: ModuleContext
) => LoadResult | Promise<LoadResult>

type InlineCommonJSOptions<Data> = {
  module: BundlerModule<Data> & {
    format: CommonJSFormat
    source: WrapperSource
  }
  resolve?: Resolve
  load?: Load
}

type LoadedCommonJSOptions<Data> = {
  module: BundlerModule<Data> & {
    format: CommonJSFormat
    source?: WrapperSource
  }
  resolve?: Resolve
  load: Load
}

type AdapterBackedOptions<Data> = {
  module: BundlerModule<Data>
  resolve: Resolve
  load: Load
}

export type CreateWrapperModuleOptions<Data = JsonValue> =
  | InlineCommonJSOptions<Data>
  | LoadedCommonJSOptions<Data>
  | AdapterBackedOptions<Data>

/**
 * EXPERIMENTAL
 * This API is experimental and may change in minor versions.
 */
export declare function createWrapperModule<Data = JsonValue>(
  options: CreateWrapperModuleOptions<Data>
): Promise<WrapperModule>

/**
 * EXPERIMENTAL
 * This API is experimental and may change in minor versions.
 */
export declare function getPackageDetails(url: string): PackageDetails | undefined
