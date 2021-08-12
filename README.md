# import-in-the-middle

**`import-in-the-middle`** is an module loading interceptor inspired by
[`require-in-the-middle`](https://npm.im/require-in-the-middle), but
specifically for ESM modules. In fact, it can even modify modules after loading
time.

## Usage

See the Typescript definition file for API docs.

You can modify anything exported from any given ESM or CJS module that's
imported in ESM files, regardless of whether they're imported statically or
dynamically.

```js
import { addHook } from 'import-in-the-middle'
import { foo } from './module-i-want-to-modify.mjs'

console.log(foo) // whatever that module exported

addHook((url, exported) => {
  // `exported` is effectively `import * as exported from ${url}`
  if (url.match(/module-i-want-to-modify.mjs$/)) {
    exported.foo += 1
  }
})

console.log(foo) // 1 more than whatever that module exported
```

This requires the use of an ESM loader hook, which can be added with the following
command-line option.

```
--loader=/path/to/import-in-the-middle/hook.mjs
```

## Limitations

* You cannot add new exports to a module. You can only modify existing ones.
* While bindings to module exports end up being "re-bound" when modified in a
  hook, dynamically imported modules cannot be altered after they're loaded.
* Modules loaded via `require` are not affected at all.
