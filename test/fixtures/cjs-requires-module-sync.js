// CJS module that require()s a package with a "module-sync" exports condition.
// On Node 22+, require() resolves to the ESM wrapper (require.mjs), which
// imports ./index.js. If hook-provided source is not stripped for CJS modules
// in the synchronous require chain, ModuleJob.runSync fails with
// ERR_VM_MODULE_LINK_FAILURE.
const pkg = require('module-sync-fixture')
// When loaded via module-sync condition, pkg is the default export (a string).
// When loaded via CJS default, pkg is { value: 'from-cjs' }.
module.exports.result = typeof pkg === 'string' ? pkg : (pkg.value ?? pkg.default)
