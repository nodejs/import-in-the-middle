// https://github.com/nodejs/import-in-the-middle/issues/139
import { strictEqual } from 'assert'
import * as lib from 'vue/server-renderer'

strictEqual(typeof lib.renderToString, 'function')
