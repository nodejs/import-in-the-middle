// source-providing-hook first (innermost), then IITM (outermost).
// This ensures IITM can intercept and strip hook-provided source for CJS
// modules in the synchronous require chain.
import { register } from 'module'

// Inner hook: provides source for CJS modules (mimics @apm-js-collab/tracing-hooks)
register(new URL('./source-providing-hook.mjs', import.meta.url).href, import.meta.url)

// Outer hook: IITM
register(new URL('../../hook.mjs', import.meta.url).href, import.meta.url)
