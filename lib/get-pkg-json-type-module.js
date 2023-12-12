const fs = require('fs')
const path = require('path')
const warn = require('./helpers')

const FILE_NAME = 'get-pkg-json-type-module'

function findNearestPackageJson(filePath) {
  let currentDir = path.dirname(filePath)
  
  while (currentDir !== '/') {
    const packageJsonPath = path.join(currentDir, 'package.json')
    try {
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8')
      return packageJsonContent;
    } catch (error) {
      // File does not exist, continue searching in the parent directory
    }

    currentDir = path.dirname(currentDir)
  }

  return null
}

function isModuleType(filePath) {
  const packageJsonContent = findNearestPackageJson(filePath)

  if (!packageJsonContent) {
    return false
  }

  try {
    const packageJson = JSON.parse(packageJsonContent)

    if (packageJson.type === 'module') {
      return true
    } else {
      return false
    }
  } catch (error) {
    warn('Error reading or parsing package.json: ' + error.message, FILE_NAME)
    return false
  }
}

module.exports = isModuleType