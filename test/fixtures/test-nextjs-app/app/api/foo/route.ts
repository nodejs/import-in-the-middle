import camelcase from 'camelcase'
import { NextResponse } from 'next/server'

import { runIitmWrapper } from '../../../iitm-turbopack.mjs'

export async function GET (request: Request) {
  camelcase('foo bar')

  return NextResponse.json(runIitmWrapper())
}
