// Unless explicitly stated otherwise all files in this repository are licensed under the Apache 2.0 License.
//
// This product includes software developed at Datadog (https://www.datadoghq.com/). Copyright 2021 Datadog, Inc.

/**
 * @param {string | ArrayBuffer | ArrayBufferView} source
 * @returns {string}
 */
export function sourceToString (source) {
  if (typeof source === 'string') return source
  if (Buffer.isBuffer(source)) return source.toString('utf8')
  if (ArrayBuffer.isView(source)) {
    return Buffer.from(source.buffer, source.byteOffset, source.byteLength).toString('utf8')
  }
  return Buffer.from(source).toString('utf8')
}

/**
 * @param {string} source
 * @returns {string}
 */
export function commentShebang (source) {
  return source.startsWith('#!') ? '//' + source.slice(2) : source
}
