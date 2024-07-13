import { strictEqual } from 'assert'
import * as lib from 'vue/server-renderer'

strictEqual(typeof lib.renderToString, 'function')
