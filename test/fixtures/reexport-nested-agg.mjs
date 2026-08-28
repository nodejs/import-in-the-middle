// `nested` reaches here through two `export *` chains that both bottom out at
// reexport-nested-leaf.mjs, so the surviving same-origin collision is detected
// while processing this module.
export * from './reexport-nested-leaf.mjs'
export * from './reexport-nested-mid.mjs'
export default 'not-reexported'
