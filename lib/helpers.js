function warn (txt, fileName) {
  process.emitWarning(txt, fileName)
}

module.exports = warn