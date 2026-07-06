# import-in-the-middle

**`import-in-the-middle`** is a module loading interceptor inspired by
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
of modules, file URLs or regular expressions to either `exclude` or specifically
`include` which modules are intercepted. This is useful if a module is not
compatible with the loader hook.

> **Note:** This feature is incompatible with the `{internals: true}` Hook option

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

> **Note:** This feature is experimental and is incompatible with the `{internals: true}` Hook option

If you are `Hook`'ing all modules before they are imported, for example in a
module loaded via the Node.js `--import` CLI argument, you can configure the
loader to intercept only modules that were specifically hooked.

`instrument.mjs`

```js
import { register } from 'module'
import { Hook, createAddHookMessageChannel } from 'import-in-the-middle'

const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel()

register('import-in-the-middle/hook.mjs', import.meta.url, registerOptions)

Hook(['fs'], (exported, name, baseDir) => {
  // Instrument the fs module
})

// Ensure that the loader has acknowledged all the modules
// before we allow execution to continue
await waitForAllMessagesAcknowledged()
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

## Synchronous loader hooks

On Node.js versions that support
[`module.registerHooks()`](https://nodejs.org/api/module.html#moduleregisterhooksoptions)
the loader can run *synchronously*, on the application thread, instead of on the
separate thread that `module.register()` uses. Running in-thread removes the
message channel: `Hook()` registrations are visible to the loader directly, so
the `createAddHookMessageChannel` / `waitForAllMessagesAcknowledged` step shown
above is unnecessary.

`module.registerHooks()` was added in 22.15.0 / 24.0.0, but its synchronous load
hook rejected the nullish CommonJS `source` the loader returns for `require()`s
pulled into the ESM graph until [nodejs/node#59929][]. The fix shipped in
**22.22.3, 24.11.1, 25.1.0 and 26.0.0**; earlier versions ship
`module.registerHooks()` but cannot run the synchronous loader. Use
`supportsSyncHooks()` to branch on this rather than a hand-written version check:

```js
import { register, supportsSyncHooks } from 'import-in-the-middle/register-hooks.mjs'

if (supportsSyncHooks()) {
  register({ include: ['package-i-want-to-include'] })
} else {
  // Fall back to the asynchronous loader, e.g. module.register('import-in-the-middle/hook.mjs').
}
```

[nodejs/node#59929]: https://github.com/nodejs/node/pull/59929

`instrument.mjs`

```js
import { register } from 'import-in-the-middle/register-hooks.mjs'
import { Hook } from 'import-in-the-middle'

register({ include: ['package-i-want-to-include'] })

Hook(['package-i-want-to-include'], (exported, name, baseDir) => {
  // Instrument the module
})
```

```shell
node --import=./instrument.mjs ./my-app.mjs
```

`register()` accepts the same `include` / `exclude` options as the asynchronous
loader and throws on a Node.js version where `supportsSyncHooks()` is `false`.

### Custom matching with `shouldInclude`

Instead of `include` / `exclude` lists, you can pass a `shouldInclude(url, specifier)`
predicate to decide which modules are intercepted. It is called for every resolved
module with the resolved URL and the import specifier; return a truthy value to
intercept the module. When a predicate is provided it takes over the decision and
the `include` / `exclude` options are ignored.

This is useful when matching doesn't map cleanly onto bare specifiers, file URLs and
regular expressions — for example a matcher built from your own configuration, or a
decision that depends on more than the specifier.

```js
import { register } from 'import-in-the-middle/register-hooks.mjs'

register({
  shouldInclude (url, specifier) {
    return specifier === 'package-i-want-to-include' ||
      url.includes('/node_modules/some-scope/')
  }
})
```

The predicate receives only the URL and the specifier, never a resolved file path.
Because `module.register()` transfers its `data` to the loader thread by structured
clone — which cannot carry a function — `shouldInclude` is supported for synchronous
registration (`register-hooks.mjs`, shown above) and for predicates constructed on
the loader thread; it is not accepted through the `data` option of the asynchronous
`module.register('import-in-the-middle/hook.mjs', ...)`.

## TypeScript modules

On Node.js versions that strip TypeScript types natively (those exposing
[`module.stripTypeScriptTypes()`](https://nodejs.org/api/module.html#modulestriptypescripttypescode-options),
>= 22.13.0 / >= 23.9.0 / >= 24.0.0), `import-in-the-middle` intercepts `.ts`,
`.mts` and `.cts` modules just like their JavaScript counterparts. The types are
stripped before the module's exports are read, so type-only exports
(`export type`, `export interface`) are not present on the intercepted
namespace; value exports are.

```ts
// math.mts
export type Op = '+' | '-'
export function add (a: number, b: number): number {
  return a + b
}
```

```js
Hook(['./math.mts'], (exported) => {
  // `exported.add` is interceptable; the `Op` type is not part of the namespace
})
```

On Node.js versions where type stripping is not enabled by default, run with
`--experimental-strip-types`. Older versions that predate
`module.stripTypeScriptTypes()` leave TypeScript modules untouched.

## Limitations

* You cannot add new exports to a module. You can only modify existing ones.
* While bindings to module exports end up being "re-bound" when modified in a
  hook, dynamically imported modules cannot be altered after they're loaded.
* Modules loaded via `require` are not affected at all.
* A module's set of export *names* is assumed to be stable for the lifetime of
  the process. `import-in-the-middle` reads a module's source once to lex its
  exports and reuses that export set on later loads of the same URL. An upstream
  loader that returns a *different set of exports* for the same URL across calls
  — a stateful codegen loader, or one that varies its output by `context` — is
  not supported and will be instrumented with the export set from its first
  load. Idempotent transforms (type stripping, AST instrumentation, minifiers)
  are unaffected, and the actual module still executes the source its real load
  returns; only the interceptable export *names* are memoized.
