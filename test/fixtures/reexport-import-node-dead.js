// @ts-expect-error - '#import-node-only' exists via test/fixtures/package.json
// eslint-disable-next-line no-constant-condition
if (false) module.exports = require('#import-node-only')
module.exports = {}
