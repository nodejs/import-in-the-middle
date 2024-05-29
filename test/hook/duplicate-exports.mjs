import * as lib from '../fixtures/duplicate.mjs'
import { notEqual, strictEqual } from 'assert'

notEqual(lib, undefined)
// foo should not be exported because there are duplicate exports
strictEqual(lib.foo, undefined)
