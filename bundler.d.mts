export type WrapperSource = string | ArrayBuffer | ArrayBufferView

export type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type WrapperExport = {
  name: string
  url: string
  localName?: string
}

export type PassthroughExports =
  | Iterable<string>
  | ((exports: readonly WrapperExport[]) => Iterable<string>)

export type BundlerModule<Data extends JsonValue = JsonValue> = {
  url: string
  format: string
  specifier: string
  source?: WrapperSource
  data?: Data
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

export type CreateWrapperModuleOptions<Data extends JsonValue = JsonValue> = {
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

export declare function createWrapperModule<Data extends JsonValue = JsonValue>(
  options: CreateWrapperModuleOptions<Data>
): Promise<WrapperModule>
