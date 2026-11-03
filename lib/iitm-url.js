// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

const { URL } = require('node:url')

/** @param {string} url The module URL or specifier. */
function parseIitm (url) {
  const queryIndex = url.indexOf('?')
  if (queryIndex === -1 || url.indexOf('iitm', queryIndex) === -1) return
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.has('iitm')) return parsed
  } catch (error) {
    return undefined
  }
}

/** @param {URL} parsedURL The parsed wrapper URL. */
function deleteIitm (parsedURL) {
  parsedURL.searchParams.delete('iitm')
  const resultUrl = parsedURL.href
  return resultUrl.startsWith('file:///node:')
    ? resultUrl.slice('file:///'.length)
    : resultUrl
}

module.exports = { parseIitm, deleteIitm }
