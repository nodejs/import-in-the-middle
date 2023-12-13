'use strict'

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

function getEsmExports (moduleStr) {
  const exportedNames = new Set()
  const tree = parser.parse(moduleStr, acornOpts)
  for (const node of tree.body) {
    if (!node.type.startsWith('Export')) continue
    switch (node.type) {
      case 'ExportNamedDeclaration':
        if (node.declaration) {
          parseDeclaration(node, exportedNames)
        } else {
          parseSpecifiers(node, exportedNames)
        }
        break
      case 'ExportDefaultDeclaration':
        exportedNames.add('default')
        break
      case 'ExportAllDeclaration':
        if (node.exported) {
          exportedNames.add(node.exported.name)
        } else {
          exportedNames.add('*')
        }
        break
      default:
        warn('unrecognized export type: ' + node.type)
    }
  }
  return Array.from(exportedNames)
}

function parseDeclaration (node, exportedNames) {
  switch (node.declaration.type) {
    case 'FunctionDeclaration':
      exportedNames.add(node.declaration.id.name)
      break
    case 'VariableDeclaration':
      for (const varDecl of node.declaration.declarations) {
        parseVariableDeclaration(varDecl, exportedNames)
      }
      break
    case 'ClassDeclaration':
      exportedNames.add(node.declaration.id.name)
      break
    default:
      warn('unknown declaration type: ' + node.delcaration.type)
  }
}

function parseVariableDeclaration (node, exportedNames) {
  switch (node.id.type) {
    case 'Identifier':
      exportedNames.add(node.id.name)
      break
    case 'ObjectPattern':
      for (const prop of node.id.properties) {
        exportedNames.add(prop.value.name)
      }
      break
    case 'ArrayPattern':
      for (const elem of node.id.elements) {
        exportedNames.add(elem.name)
      }
      break
    default:
      warn('unknown variable declaration type: ' + node.id.type)
  }
}

function parseSpecifiers (node, exportedNames) {
  for (const specifier of node.specifiers) {
    if (specifier.exported.type === 'Identifier') {
      exportedNames.add(specifier.exported.name)
    } else if (specifier.exported.type === 'Literal') {
      exportedNames.add(specifier.exported.value)
    } else {
      warn('unrecognized specifier type: ' + specifier.exported.type)
    }
  }
}

module.exports = getEsmExports
