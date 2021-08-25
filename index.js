// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

const path = require('path')
const parse = require('module-details-from-path')
const { fileURLToPath } = require('url')

const importHooks = [] // TODO should this be a Set?

const setters = new WeakMap()
const specifiers = new Map()

const toHook = []

const proxyHandler = {
  set(target, name, value) {
    return setters.get(target)[name](value)
  }
}

function _register(name, namespace, set, specifier) {
  specifiers.set(name, specifier)
  setters.set(namespace, set)
  const proxy = new Proxy(namespace, proxyHandler)
  importHooks.forEach(hook => hook(name, proxy))
  toHook.push([name, proxy])
}

function callHookFn(hookFn, namespace, name, baseDir) {
  const newDefault = hookFn(namespace, name, baseDir)
  if (newDefault && newDefault !== namespace) {
    namespace.default = newDefault
  }
}

function Hook(modules, options, hookFn) {
  if ((this instanceof Hook) === false) return new Hook(modules, options, hookFn)
  if (typeof modules === 'function') {
    hookFn = modules
    modules = null
    options = null
  } else if (typeof options === 'function') {
    hookFn = options
    options = null
  }
  const internals = options ? options.internals === true : false

  this._iitmHook = (name, namespace) => {
    const filename = name
    const isBuiltin = name.startsWith('node:')
    let baseDir

    if (isBuiltin) {
      name = name.replace(/^node:/, '')
    } else {
      name = name.replace(/^file:\/\//, '')
      const details = parse(name)
      if (details) {
        name = details.name
        baseDir = details.basedir
      }
    }

    if (modules) {
      for (const moduleName of modules) {
        if (moduleName === name) {
          if (baseDir) {
            if (internals) {
              name = name + path.sep + path.relative(baseDir, fileURLToPath(filename))
            } else {
              if (!baseDir.endsWith(specifiers.get(filename))) continue
            }
          }
          callHookFn(hookFn, namespace, name, baseDir)
        }
      }
    } else {
      callHookFn(hookFn, namespace, name, baseDir)
    }
  }

  importHooks.push(this._iitmHook)
  toHook.forEach(([name, namespace]) => this._iitmHook(name, namespace))
}

Hook.prototype.unhook = function () {
  const index = importHooks.indexOf(this._iitmHook)
  if (index > -1) {
    importHooks.splice(index, 1)
  }
}

module.exports = Hook

module.exports._register = _register
