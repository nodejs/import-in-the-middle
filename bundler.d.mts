// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

export type WrapperSource = string | ArrayBuffer | ArrayBufferView

export type JsonValue =
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ModuleTarget = {
  url: string
  format?: string
}

export type BundlerModule<Target = ModuleTarget, Data extends JsonValue = JsonValue> = {
  url: string
  format: string
  specifier: string
  source?: WrapperSource
  target?: Target
  data?: Data
}

export type ModuleContext = {
  format?: string
  parentURL?: string
}

export type ResolveResult<Target = ModuleTarget> = {
  url: string
  format?: string
  target?: Target
  watchFiles?: Iterable<string>
}

export type LoadResult = {
  source?: WrapperSource
  format?: string
  watchFiles?: Iterable<string>
}

export type WrapperImport<Target = ModuleTarget> = {
  specifier: string
  kind: 'module' | 'runtime'
  url: string
  format?: string
  target: Target | ModuleTarget
}

export type WrapperModule<Target = ModuleTarget> = {
  code: string
  format: 'module' | 'commonjs'
  imports: WrapperImport<Target>[]
  watchFiles: string[]
  sideEffects: true
}

export type CreateWrapperModuleOptions<
  Target = ModuleTarget,
  Data extends JsonValue = JsonValue
> = {
  module: BundlerModule<Target, Data>
  resolve: (
    specifier: string,
    context: ModuleContext
  ) => ResolveResult<Target> | Promise<ResolveResult<Target>>
  load: (
    target: Target | ModuleTarget,
    context: ModuleContext
  ) => LoadResult | Promise<LoadResult>
}

export declare function createWrapperModule<
  Target = ModuleTarget,
  Data extends JsonValue = JsonValue
>(options: CreateWrapperModuleOptions<Target, Data>): Promise<WrapperModule<Target>>
