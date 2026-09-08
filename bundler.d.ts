export * from './bundler.mjs'

/**
 * EXPERIMENTAL
 * This API is experimental and may change in minor versions.
 */
export declare function getNodeModuleFormat(
  url: string,
  packageJsonUrl?: string,
  packageType?: string
): 'builtin' | 'module' | 'module-typescript' | 'commonjs' | 'commonjs-typescript' | undefined
