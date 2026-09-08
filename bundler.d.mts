export type WrapperSource = string | ArrayBuffer | ArrayBufferView

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
  format: string
  specifier: string
  source?: WrapperSource
  data?: JsonCompatible<Data>
  passthroughExports?: PassthroughExports
}

export type ModuleContext = {
  format?: string
  parentURL?: string
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
}

export type CreateWrapperModuleOptions<Data = JsonValue> = {
  module: BundlerModule<Data>
  resolve: (
    specifier: string,
    context: ModuleContext
  ) => ResolveResult | Promise<ResolveResult>
  load: (
    url: string,
    context: ModuleContext
  ) => LoadResult | Promise<LoadResult>
}

/**
 * EXPERIMENTAL
 * This API is experimental and may change in minor versions.
 */
export declare function createWrapperModule<Data = JsonValue>(
  options: CreateWrapperModuleOptions<Data>
): Promise<WrapperModule>
