import Hook from '../../index.js'
import { register, supportsSyncHooks } from '../../register-hooks.mjs'

if (supportsSyncHooks()) {
  register()
  const hook = new Hook(() => {})
  const targetURL = new URL('./specifier-string.js', import.meta.url)
  await import(targetURL)
  global.gc()
  for (let index = 0; index < 1_000_000; index++) await import(targetURL)
  hook.unhook()
}
