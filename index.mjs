// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

const importHooks = [] // TODO should this be a Set?

const setters = new WeakMap()

const toHook = []

const proxyHandler = {
  set(target, name, value) {
    return setters.get(target)[name](value)
  }
}

export function _register(name, namespace, set) {
  setters.set(namespace, set)
  const proxy = new Proxy(namespace, proxyHandler)
  importHooks.forEach(hook => hook(name, proxy))
  toHook.push([name, proxy])
}

export function addHook(hook) {
  importHooks.push(hook)
  toHook.forEach(([name, namespace]) => hook(name, namespace))
}

export function removeHook(hook) {
  const index = importHooks.indexOf(hook)
  if (index > -1) {
    importHooks.splice(index, 1)
  }
}
