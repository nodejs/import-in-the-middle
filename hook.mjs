// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

const specifiers = new Map()

export async function resolve (specifier, context, parentResolve) {
  const { parentURL = '' } = context

  if (specifier.startsWith('iitm:')) {
    specifier = specifier.replace('iitm:', '')
  }
  const url = await parentResolve(specifier, context, parentResolve)

  if (parentURL === import.meta.url || parentURL.startsWith('iitm:')) {
    return url
  }

  specifiers.set(url.url, specifier)

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

const iitmURL = new URL('lib/register.js', import.meta.url).toString()
export async function getSource (url, context, parentGetSource) {
  if (url.startsWith('iitm:')) {
    const realUrl = url.replace('iitm:', '')
    const realModule = await import(realUrl)
    const exportNames = Object.keys(realModule)
    return {
      source: `
import { register } from '${iitmURL}'
import * as namespace from '${url}'
const set = {}
${exportNames.map((n) => `
let $${n} = namespace.${n}
export { $${n} as ${n} }
set.${n} = (v) => {
  $${n} = v
  return true
}
`).join('\n')}
register('${realUrl}', namespace, set, '${specifiers.get(realUrl)}')
`
    }
  }

  return parentGetSource(url, context, parentGetSource)
}

// For Node.js 16.12.0 and higher.
export async function load (url, context, parentLoad) {
  if (url.startsWith('iitm:')) {
    const { source } = await getSource(url, context)
    return {
      source,
      format: 'module'
    }
  }

  return parentLoad(url, context, parentLoad)
}

