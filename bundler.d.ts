export * from './bundler.mjs'

export declare function getNodeModuleFormat(
  url: string,
  packageJsonUrl?: string,
  packageType?: string
): 'builtin' | 'module' | 'module-typescript' | 'commonjs' | 'commonjs-typescript' | undefined
