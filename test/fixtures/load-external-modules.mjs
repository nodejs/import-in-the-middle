import { bar as scopedsub } from '@scope/some-scoped-module/sub'
import { bar as scopedCJSsub } from '@scope/some-scoped-cjs-module/sub'
import { bar as unscopedsub } from 'some-external-module/sub'
import { bar as unscopedCJSsub } from 'some-external-cjs-module/sub'
import { foo as scoped } from '@scope/some-scoped-module'
import { foo as scopedCJS } from '@scope/some-scoped-cjs-module'
import { foo as unscoped } from 'some-external-module'
import { foo as unscopedCJS } from 'some-external-cjs-module'

export {
  scoped,
  scopedsub,
  scopedCJS,
  scopedCJSsub,
  unscoped,
  unscopedsub,
  unscopedCJSsub,
  unscopedCJS
}
