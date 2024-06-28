'use strict'

//  Vendored from https://github.com/watson/module-details-from-path/tree/6b231a35fae6b7f5b6b12b55fbb75fd4913afe5a
// The MIT License (MIT)

// Copyright (c) 2016 Thomas Watson Steen

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

// This has been vendored to reduce the number of dependencies required to run this module, update
// syntax to more modern node versions and functionality to return the `path` has been removed.

const path = require('path')

/**
 * @typedef {Object} ModuleDetails - an object containing module details
 * @property {string} name - the name of the module
 * @property {number} basedir - the basedir of the module
 */

/**
 * Get module details from a file path.
 *
 * @param file {string} - The file path to get module details from.
 * @returns {ModuleDetails|undefined} Module details or undefined if the details cannot be
 * parsed from the path.
 *
 * @example
 * ```js
 * const details = moduleDetailsFromPath('/Users/test/code/node_modules/drizzle-orm/node_modules/mysql/lib/protocol/sequences/Query.js')
 *
 * // emits 'mysql
 * console.log(details.name)
 *
 * // emits '/Users/test/code/node_modules/drizzle-orm/node_modules/mysql'
 * console.log(details.basedir)
 * ```
 */
function moduleDetailsFromPath (file) {
  const segments = file.split(path.sep)
  const index = segments.lastIndexOf('node_modules')

  const packageName = segments[index + 1]

  if (index === -1 || !packageName) {
    return
  }

  const basedir = segments.slice(0, index + 2).join(path.sep)

  // If packageName is a scope, for example `@babel`, we need
  // to include the next segment in the package name. This would
  // make sure `@babel/core` is emitted instead of just `@babel`.
  const scoped = packageName[0] === '@'
  if (scoped) {
    const scopedPackageName = segments[index + 2]
    if (!scopedPackageName) {
      return
    }

    return {
      name: `${packageName}/${scopedPackageName}`,
      basedir
    }
  }

  return {
    name: packageName,
    basedir
  }
}

module.exports = moduleDetailsFromPath
