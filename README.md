# import-in-the-middle

**`import-in-the-middle`** is an module loading interceptor inspired by
[`require-in-the-middle`](https://npm.im/require-in-the-middle), but
specifically for ESM modules. In fact, it can even modify modules after loading
time.

## Usage

The API for
`require-in-the-middle` is followed as closely as possible as the default
export. There are lower-level `addHook` and `removeHook` exports available which
don't do any filtering of modules, and present the full file URL as a parameter
to the hook. See the Typescript definition file for detailed API docs.

You can modify anything exported from any given ESM or CJS module that's
imported in ESM files, regardless of whether they're imported statically or
dynamically.

```js
import { Hook } from 'import-in-the-middle'
import { foo } from 'package-i-want-to-modify'

console.log(foo) // whatever that module exported

Hook(['package-i-want-to-modify'], (exported, name, baseDir) => {
  // `exported` is effectively `import * as exported from ${url}`
  exported.foo += 1
})

console.log(foo) // 1 more than whatever that module exported
```

This requires the use of an ESM loader hook, which can be added with the following
command-line option.

```shell
node --loader=import-in-the-middle/hook.mjs my-app.mjs
```

Since `--loader` has been deprecated you can also register the loader hook programmatically via the Node
[`module.register()`](https://nodejs.org/api/module.html#moduleregisterspecifier-parenturl-options)
API. However, for this to be able to hook non-dynamic imports, it needs to be
registered before your app code is evaluated via the `--import` command-line option.

`my-loader.mjs`
```js
import * as module from 'module'

module.register('import-in-the-middle/hook.mjs', import.meta.url)
```
```shell
node --import=./my-loader.mjs ./my-code.mjs
```

When registering the loader hook programmatically, it's possible to pass a list
of modules or file URLs to either exclude or specifically include which modules
are intercepted. This is useful if a module is not compatible with the loader
hook. 
```js
import * as module from 'module'

// Exclude intercepting a specific module by name
module.register('import-in-the-middle/hook.mjs', import.meta.url, {
  data: { exclude: ['package-i-want-to-exclude'] }
})

// Only intercept a specific module by name
module.register('import-in-the-middle/hook.mjs', import.meta.url, {
  data: { include: ['package-i-want-to-include'] }
})
```

### Only Intercepting Hooked modules

If you are `Hook`'ing all modules before they are imported, for example in a
module loaded via the Node.js `--import` argument, you can configure the loader
hook to only intercept those specific modules: 

`instrument.mjs`
```js
import { register } from 'module'
import { Hook, createAddHookMessageChannel } from 'import-in-the-middle'

const addHookMessagePort = createAddHookMessageChannel()

const options = { 
  data: { addHookMessagePort }, 
  transferList: [addHookMessagePort] 
}

register('import-in-the-middle/hook.mjs', import.meta.url, options)

Hook(['fs'], (exported, name, baseDir) => {
  // Instrument the fs module
})
```
`my-app.mjs`
```js
import * as fs from 'fs'
// fs will be instrumented!
fs.readFileSync('file.txt')
```

```shell
node --import=./instrument.mjs ./my-app.mjs
```

## Limitations

* You cannot add new exports to a module. You can only modify existing ones.
* While bindings to module exports end up being "re-bound" when modified in a
  hook, dynamically imported modules cannot be altered after they're loaded.
* Modules loaded via `require` are not affected at all.
