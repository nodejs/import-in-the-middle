// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

export type WrapperSource = string | ArrayBuffer | ArrayBufferView

export type BundlerModule = {
  url: string
  format: string
  specifier: string
  source?: WrapperSource
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

export type CreateWrapperModuleOptions = {
  module: BundlerModule
  resolve: (
    specifier: string,
    context: ModuleContext
  ) => ResolveResult | Promise<ResolveResult>
  load: (
    url: string,
    context: ModuleContext
  ) => LoadResult | Promise<LoadResult>
}

export declare function createWrapperModule(options: CreateWrapperModuleOptions): Promise<WrapperModule>
