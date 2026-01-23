// @ts-expect-error - '#import-default-only' exists via test/fixtures/package.json
// eslint-disable-next-line no-constant-condition
if (false) module.exports = require('#import-default-only')
module.exports = {}
