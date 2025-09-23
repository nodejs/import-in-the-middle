import { readFile } from 'fs/promises'

export async function load (url, context, nextLoad) {
  const result = await nextLoad(url, context)
  if (!result.source && url.startsWith('file:')) {
    result.source = await readFile(new URL(url))
  }
  return result
}
