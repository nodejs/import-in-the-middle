// No exports; designed to exercise branches in lib/get-exports.mjs's hasEsmSyntax().

/* import.meta.url */
// eslint-disable-next-line no-unused-expressions
'import.meta.url'
// eslint-disable-next-line no-unused-expressions
'import.meta.url'
// eslint-disable-next-line no-unused-vars, quotes
const template = `import.meta.url`

// Identifier-boundary cases (prev is ident char => should not treat as keyword)
// These are intentionally unused; they just exist as scanner inputs.
// eslint-disable-next-line no-unused-vars
const firstimport = 1
// eslint-disable-next-line no-unused-vars
const second2import = 2
// eslint-disable-next-line no-unused-vars
const someimport = 3

// Keyword followed by ident char => should not treat as keyword
// eslint-disable-next-line no-unused-vars
const importA = 1
// eslint-disable-next-line no-unused-vars
const import2 = 2

// Dynamic import (`import(`) must not be treated as ESM-only syntax.
function f () {
  // Deliberate whitespace for skipWhitespace() coverage.
  // eslint-disable-next-line no-useless-call, func-call-spacing, space-in-parens
  return import ( './foo.mjs' )
}
// eslint-disable-next-line no-unused-expressions
f
