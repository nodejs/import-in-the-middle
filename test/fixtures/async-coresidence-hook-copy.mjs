import { createHook } from '../../create-hook.mjs'

const meta = { url: new URL('../../hook.mjs', import.meta.url).href }
const { initialize, load, resolve } = createHook(meta)

export { initialize, load, resolve }
