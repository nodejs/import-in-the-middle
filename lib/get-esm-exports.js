'use strict'

const recast = require('recast')
const { Parser } = require('acorn')
const { importAssertions } = require('acorn-import-assertions')
const warn = require('./helpers')

const TS_EXTENSION_RE = /\.(ts|mts|cts)$/

const acornOpts = {
  ecmaVersion: 'latest',
  sourceType: 'module'
}

const parser = Parser.extend(importAssertions)
const FILE_NAME = 'get-esm-exports'

function getEsmExports(moduleStr, generate=false, url=undefined) {
  const exportSpecifierNames = new Set()
  const exportAlias = {}
  let ast
  
  // if it's a typescript file, we need to parse it with recasts typescript parser
  if (url && TS_EXTENSION_RE.test(url)) {
    ast = recast.parse(moduleStr, {parser: require("recast/parsers/typescript")})
  } else {
    ast = recast.parse(moduleStr, {parser: {
      parse(source) {
        return parser.parse(source, acornOpts)
      }
    }})
  }

  const iitmRenamedExport = 'iitmRenamedExport';

  // Loop through the top-level declarations of the AST
  for (const statement of ast.program.body) {
    if (statement.type === 'ExportNamedDeclaration') {
      const node = statement;

      if (node.declaration) {
        parseDeclaration(node.declaration, exportAlias);
      } else {
        parseSpecifiers(node.specifiers, exportAlias, exportSpecifierNames);
      }
    } else if (statement.type === 'ExportDefaultDeclaration') {
      const node = statement;

      if (['ObjectExpression', 'ArrayExpression', 'Literal'].includes(node.declaration.type) && generate) {
        const variableDeclaration = {
          type: 'VariableDeclaration',
          kind: 'let',
          declarations: [
            {
              type: 'VariableDeclarator',
              id: {
                type: 'Identifier',
                name: iitmRenamedExport,
              },
              init: node.declaration,
            },
          ],
        };

        // Replace the current ExportDefaultDeclaration with the new VariableDeclaration
        ast.program.body.splice(ast.program.body.indexOf(statement), 1, variableDeclaration);

        const newExportDefaultDeclaration = {
          type: 'ExportDefaultDeclaration',
          declaration: {
            type: 'Identifier',
            name: iitmRenamedExport,
          },
        };

        // Insert the new ExportDefaultDeclaration after the VariableDeclaration
        ast.program.body.splice(ast.program.body.indexOf(variableDeclaration) + 1, 0, newExportDefaultDeclaration);
      } else if (['FunctionDeclaration', 'Identifier', 'ClassDeclaration'].includes(node.declaration.type) && generate) {
        node.declaration.id = { type: 'Identifier', name: iitmRenamedExport };
      }
      exportAlias['default'] = iitmRenamedExport;
    } else if (statement.type === 'ExportAllDeclaration') {
      const node = statement;
      const exportedName = node.exported ? node.exported.name : '*';

      exportAlias[exportedName] = exportedName;
    } else if (statement.type === 'ExportSpecifier') {
      const node = statement;
      exportSpecifierNames.add(node.local.name);

      if (node.exported.name) {
        exportAlias[node.exported.name] = node.local.name;
      } else if (node.exported.value) {
        exportAlias[node.exported.value] = node.local.name;
      } else {
        warn('unrecognized specifier export: ' + node.exported, FILE_NAME);
      }
    }
  }

  if (exportSpecifierNames.size !== 0 && generate) {
    convertExportSpecifierToLet(exportSpecifierNames, ast);
  }

  if (generate) {
    return {
      exportAlias: exportAlias,
      code: recast.print(ast).code,
    };
  }

  return Object.keys(exportAlias);
}

function convertExportSpecifierToLet(exportSpecifierNames, ast) {
  for (const statement of ast.program.body) {
    if (statement.type === 'VariableDeclaration') {
      const declaration = statement;
  
      if (declaration.kind === 'const') {
        for (const declarator of declaration.declarations) {
          const variableName = declarator.id.name;
          if (exportSpecifierNames.has(variableName)) {
            declaration.kind = 'let';
          }
        }
      }
    }
  }
}

function parseDeclaration(declaration, exportAlias) {
  switch (declaration.type) {
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      exportAlias[declaration.id.name] = declaration.id.name
      break
    case 'VariableDeclaration':
      for (const varDecl of declaration.declarations) {
        if (declaration.kind === 'const') {
          declaration.kind = 'let'
        }
        parseVariableDeclaration(varDecl, exportAlias)
      }
      break
    default:
      warn('unknown declaration type: ' + declaration.type, FILE_NAME)
  }
}

function parseVariableDeclaration(varDecl, exportAlias) {
  switch (varDecl.id.type) {
    case 'Identifier':
      exportAlias[varDecl.id.name] = varDecl.id.name
      break
    case 'ObjectPattern':
      for (const prop of varDecl.id.properties) {
        exportAlias[prop.value.name] = prop.value.name
      }
      break
    case 'ArrayPattern':
      for (const elem of varDecl.id.elements) {
        if (elem) {
          exportAlias[elem.name] = elem.name
        }
      }
      break
    default:
      warn('unknown variable declaration type: ' + varDecl.id.type, FILE_NAME)
  }
}

function parseSpecifiers(specifiers, exportAlias, exportSpecifierNames) {
  for (const specifier of specifiers) {
    if (specifier.type === 'ExportSpecifier') {
      exportSpecifierNames.add(specifier.local.name)
      if (specifier.exported && specifier.exported.name) {
        exportAlias[specifier.exported.name] = specifier.local.name
      } else if (specifier.exported && specifier.exported.value) {
        exportAlias[specifier.exported.value] = specifier.local.name
      } else {
        warn('unrecognized specifier export: ' + specifier, FILE_NAME)
      }
    }
    else if (specifier.exported.type === 'Identifier') {
      exportAlias[specifier.exported.name] = specifier.exported.name
    } else if (specifier.exported.type === 'Literal') {
      exportAlias[specifier.exported.value] = specifier.exported.value
    } 
    else {
      warn('unrecognized specifier type: ' + specifier.exported.type, FILE_NAME)
    }
  }
}

module.exports = getEsmExports
