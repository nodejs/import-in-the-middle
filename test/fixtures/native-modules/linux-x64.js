if (process.report.getReport().header.glibcVersionRuntime) {
  module.exports = require('@node-rs/crc32-linux-x64-gnu')
} else {
  module.exports = require('@node-rs/crc32-linux-x64-musl')
}
