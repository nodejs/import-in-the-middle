import { builtinModules } from 'module'

export async function resolve (specifier, context, parentResolve) {
  const { parentURL = '' } = context

  if (specifier.startsWith('iitm:')) {
    specifier = specifier.replace('iitm:', '')
  }
  const url = await parentResolve(specifier, context, parentResolve)

  if (builtinModules.includes(specifier) ||
      parentURL === import.meta.url ||
      parentURL.startsWith('iitm:')) {
    return url
  }

  return {
    url: `iitm:${url.url}`
  }
}

export function getFormat (url, context, parentGetFormat) {
  if (url.startsWith('iitm:')) {
    return {
      format: 'module'
    }
  }

  return parentGetFormat(url, context, parentGetFormat)
}

const iitmURL = new URL('index.mjs', import.meta.url).toString()
export async function getSource (url, context, parentGetSource) {
  if (url.startsWith('iitm:')) {
    const realName = url.replace('iitm:', '')
    const real = await import(realName)
    const names = Object.keys(real)
    return {
      source: `
import { _register } from '${iitmURL}'
import * as namespace from '${url}'
const set = {}
${names.map((n) => `
let $${n} = namespace.${n}
export { $${n} as ${n} }
set.${n} = (v) => {
  $${n} = v
  return true
}
`).join('\n')}
_register('${realName}', namespace, set)
`
    }
  }

  return parentGetSource(url, context, parentGetSource)
}
