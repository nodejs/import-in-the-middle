// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.


const importHooks = [] // TODO should this be a Set?
const setters = new WeakMap()
const specifiers = new Map()
const toHook = []

const proxyHandler = {
  set(target, name, value) {
    return setters.get(target)[name](value)
  }
}

function register(name, namespace, set, specifier) {
  specifiers.set(name, specifier)
  setters.set(namespace, set)
  const proxy = new Proxy(namespace, proxyHandler)
  importHooks.forEach(hook => hook(name, proxy))
  toHook.push([name, proxy])
}

exports.register = register
exports.importHooks = importHooks
exports.specifiers = specifiers
exports.toHook = toHook
