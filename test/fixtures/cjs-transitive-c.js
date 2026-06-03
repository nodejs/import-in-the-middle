// Deepest CJS module in the transitive require chain.
// If IITM wraps this module, the generated shim will try to
// `import { register } from '...'` which fails under synchronous
// ModuleJob.runSync with ERR_VM_MODULE_LINK_FAILURE.
module.exports.value = 'deep'
