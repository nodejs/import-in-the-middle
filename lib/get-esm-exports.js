'use strict'

const recast = require('recast');
const { Parser } = require('acorn')
const { importAssertions } = require('acorn-import-assertions');

const acornOpts = {
  ecmaVersion: 'latest',
  sourceType: 'module'
}

const parser = Parser.extend(importAssertions)

function warn (txt) {
  process.emitWarning(txt, 'get-esm-exports')
}

function getEsmExports(moduleStr, generate=false) {
  const exportSpecifierNames = new Set();
  const exportAlias = {}
  const ast = recast.parse(moduleStr, {parser: {
    parse(source) {
      return parser.parse(source, acornOpts);
    }
  }})

  recast.visit(ast, {
    visitNode(path) {
      const node = path.node;

      if (!node.type.startsWith('Export')) {
        this.traverse(path);
        return;
      }

      switch (node.type) {
        case 'ExportNamedDeclaration':
          if (node.declaration) {
            parseDeclaration(node.declaration, exportAlias);
          } else {
            parseSpecifiers(node.specifiers, exportAlias, exportSpecifierNames);
          }
          break;
        case 'ExportDefaultDeclaration':
          const iitmRenamedExport = 'iitmRenamedExport';
          if (node.declaration.type === 'ObjectExpression' || node.declaration.type === 'ArrayExpression' || node.declaration.type === 'Literal') {
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
            path.replace(variableDeclaration);
            const newExportDefaultDeclaration = {
              type: 'ExportDefaultDeclaration',
              declaration: {
                type: 'Identifier',
                name: iitmRenamedExport,
              },
            };
            path.insertAfter(newExportDefaultDeclaration);
          } else {
            node.declaration.id = { type: 'Identifier', name: iitmRenamedExport };
          }
          exportAlias['default'] = iitmRenamedExport;
          break;
        case 'ExportAllDeclaration':
          const exportedName = node.exported ? node.exported.name : '*';
          exportAlias[exportedName] = exportedName;
          break;
        case 'ExportSpecifier':
          exportSpecifierNames.add(node.local.name)
          if (node.exported.name) {
            exportAlias[node.exported.name] = node.local.name;
          } else if (node.exported.value) {
            exportAlias[node.exported.value] = node.local.name;
          } else {
            warn('unrecognized specifier export: ' + node.exported);
          }
          break;
        default:
          warn('unrecognized export type: ' + node.type);
      }
      this.traverse(path);
    },
  });
  if (exportSpecifierNames.size !== 0) {
    convertExportSpecifierToLet(exportSpecifierNames, ast)
  }

  if (generate) {
    return {
      exportAlias: exportAlias,
      code: recast.print(ast).code
    }
  }

  return Object.keys(exportAlias)
}

function convertExportSpecifierToLet(exportSpecifierNames, ast) {
  recast.visit(ast, {
    visitVariableDeclaration(path) {
      const declaration = path.node;
      if (declaration.kind === 'const') {
        for (const declarator of declaration.declarations) {
          const variableName = declarator.id.name;
          if (exportSpecifierNames.has(variableName)) {
            declaration.kind = 'let';
          }
        }
      }
      this.traverse(path);
    },
  });
}

function parseDeclaration(declaration, exportAlias) {
  switch (declaration.type) {
    case 'FunctionDeclaration':
      exportAlias[declaration.id.name] = declaration.id.name
      break;
    case 'VariableDeclaration':
      for (const varDecl of declaration.declarations) {
        if (declaration.kind === 'const') {
          declaration.kind = 'let';
        }
        parseVariableDeclaration(varDecl, exportAlias);
      }
      break;
    case 'ClassDeclaration':
      exportAlias[declaration.id.name] = declaration.id.name
      break;
    default:
      warn('unknown declaration type: ' + declaration.type);
  }
}

function parseVariableDeclaration(varDecl, exportAlias) {
  switch (varDecl.id.type) {
    case 'Identifier':
      exportAlias[varDecl.id.name] = varDecl.id.name
      break;
    case 'ObjectPattern':
      for (const prop of varDecl.id.properties) {
        exportAlias[prop.value.name] = prop.value.name
      }
      break;
    case 'ArrayPattern':
      for (const elem of varDecl.id.elements) {
        if (elem) {
          exportAlias[elem.name] = elem.name
        }
      }
      break;
    default:
      warn('unknown variable declaration type: ' + varDecl.id.type);
  }
}

function parseSpecifiers(specifiers, exportAlias, exportSpecifierNames) {
  for (const specifier of specifiers) {
    if (specifier.type === 'ExportSpecifier') {
      exportSpecifierNames.add(specifier.local.name)
      if (specifier.exported?.name) {
        exportAlias[specifier.exported.name] = specifier.local.name;
      } else if (specifier.exported?.value) {
        exportAlias[specifier.exported.value] = specifier.local.name;
      } else {
        warn('unrecognized specifier export: ' + specifier);
      }
    }
    else if (specifier.exported.type === 'Identifier') {
      exportAlias[specifier.exported.name] = specifier.exported.name
    } else if (specifier.exported.type === 'Literal') {
      exportAlias[specifier.exported.value] = specifier.exported.value
    } 
    else {
      warn('unrecognized specifier type: ' + specifier.exported.type);
    }
  }
}

module.exports = getEsmExports
