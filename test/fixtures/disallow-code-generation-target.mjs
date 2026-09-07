// Combine a decoded bare star re-export specifier and quoted export name so the
// no-code-generation Hook test pins both lexer paths.
const value = 42

export * from 'some-external-module'
export { value as 'quoted name' }
