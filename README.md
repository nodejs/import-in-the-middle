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

Hook callbacks receive an optional fourth argument, `format`, with the wrapped
module's loader format. CommonJS modules report `commonjs`, including type-stripped
CommonJS. Other formats retain the loader's value. This argument is also available
to `addHook` callbacks, after the original import specifier. Hooks registered after
an import receive the same format during replay. Older generated wrappers provide
`undefined`, so consumers must handle missing format metadata.

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

## Development benchmarks

See [benchmark/README.md](benchmark/README.md) for the PR benchmark method and
how to check measurement noise locally.

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

### Opting out of CJS source stripping

On Node 22+, when a CJS module is loaded through the ESM translator and another
loader hook provides its source (instead of leaving it `null` for Node to read
natively), `require()` calls inside that CJS module for packages using the
`"module-sync"` exports condition fail with `ERR_VM_MODULE_LINK_FAILURE`. To work
around this Node bug, `import-in-the-middle` strips hook-provided source for
CJS modules in the synchronous require chain, forcing Node to use its native CJS
loader which handles this correctly.

If you rely on a downstream loader hook seeing (and acting on) the source of
CJS modules in the require chain, you can opt out of this workaround by passing
`disableCjsSourceStripping: true` in the hook config. The workaround remains
enabled by default.

```js
import { register } from 'import-in-the-middle/register-hooks.mjs'

register({
  include: ['package-i-want-to-include'],
  disableCjsSourceStripping: true
})
```

This option is accepted by both synchronous (`register-hooks.mjs`) and
asynchronous (`module.register('import-in-the-middle/hook.mjs', ...)`) registration.

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

## Generating facades without the loader (experimental)

> **Note:** This API is experimental and may change in minor versions.

`import-in-the-middle/wrapper.mjs` exports `createWrapperModule`, which generates
the same ESM facade the loader generates, for a module *you* selected, without
installing any loader hooks. It is meant for tools that own module loading
themselves: bundler plugins that insert facades before bundling removes module
boundaries, and custom synchronous `module.registerHooks()` hooks that decide
ESM/CommonJS handling on their own. The facade registers the module with the
same runtime `Hook`/`addHook` use, so existing hooks and late replay work
unchanged.

```js
import { createWrapperModule } from 'import-in-the-middle/wrapper.mjs'

// Build time: adapters may return values or Promises.
const { code, imports, watchFiles, sideEffects } = await createWrapperModule({
  url, // canonical URL, e.g. 'file:///app/node_modules/pkg/index.js'
  source, // that module's ESM JavaScript source
  specifier, // e.g. 'pkg'
  resolve, // (specifier, { parentURL, kind }) => { url, format?, watchFiles? }
  load // (url, { format }) => { source, format?, watchFiles? }
})

// Inside a synchronous hook: adapters must return synchronously.
const wrapper = createWrapperModule({ url, source, specifier, resolve, load, sync: true })

// A builtin: no source, and no adapters are needed.
const http = createWrapperModule({ url: 'node:http', specifier: 'http', sync: true })
```

**Execution mode.** Without `sync`, or with `sync: false`, the function returns a
Promise of the [result](#result), and invalid options or adapter failures
reject it. With `sync: true` it returns the result itself, and `resolve` and
`load` must return synchronously. A Promise returned by an adapter throws a `TypeError`, and
IITM observes that Promise so it is not reported as an unhandled rejection. The
mode is chosen only by `sync`, never by what the adapters return.

**Root module.** `source` must be a string containing ESM JavaScript. Byte
decoding, TypeScript/JSX transpilation and deciding that the module is ESM are
the caller's job. IITM does not infer the root format, and it never reloads the
root: whenever `url` appears in the graph, `source` is used. An empty string is
a valid module.

**Builtin root.** A Node.js builtin is wrapped by passing its `node:` URL
(`node:fs`, not `fs`) and omitting `source`. Its export names come from the
builtin itself, and `resolve` and `load` are optional because they are never
called. The facade imports the builtin through an `external` module entry of
the manifest and registers it with the format `builtin`, as the loader does. A `node:` URL that
is not a builtin, or one given together with `source`, is a `TypeError`.

**Graph adapters.** `resolve` and `load` are only used to discover exports
re-exported from other modules:

* `resolve(specifier, { parentURL, kind })` is called with `kind: 'import'` for
  `export * from` and with `kind: 'require'` for a CommonJS re-export
  (`module.exports = require('./x')`). For `kind: 'import'`, relative specifiers
  arrive already joined against `parentURL` as absolute URLs. A resolver that
  only accepts paths or bare specifiers must handle these itself, for example
  by converting `file:` URLs to paths. For `kind: 'require'`, the specifier
  arrives as written, including `#imports`, and `resolve` is also called for
  `.json` and `.node` targets, which are then skipped without reaching `load`.
  Return `{ url, format?, watchFiles? }`, where `url` is an absolute URL. Use a
  `node:` URL for builtins.
* Relative `export * from` specifiers are joined against the declaring
  module's URL, so `url` and resolved URLs of modules with relative re-exports
  must be hierarchical, such as `file:` URLs. A URL like `virtual:entry` cannot
  serve as the base of `./dep.js`.
* `load(url, { format })` returns `{ source, format?, watchFiles? }`, where
  `source` is a string, `ArrayBuffer` or typed array. Builtins and the root never reach `load`,
  so returning `format: 'builtin'` from it is an error.
  Its `format` overrides the one from `resolve`; when omitted, the resolved
  format is retained. Only when neither adapter supplies a format is a module
  with ESM syntax analyzed as ESM and anything else as CommonJS.
* `watchFiles`, on either result, lists extra files the facade depends on,
  such as a `package.json` consulted while resolving, as an iterable of
  absolute URL strings. A string, a non-iterable or a relative entry is a
  `TypeError`.
* A `format`, when given, must be a string.
* IITM performs no filesystem reads or CommonJS resolution of its own here. A
  `load` result without source is an error. Adapters may cache inside their
  callbacks.

<a id="result"></a>
**Result.** The function returns `{ code, imports, watchFiles, sideEffects: true }`:

```js
{
  code: 'import { register, ModuleBinder } from "./__iitm_runtime__.js"\n' +
    'import * as namespace from "./__iitm_module_0__.js"\n...',
  imports: [
    {
      specifier: './__iitm_runtime__.js',
      kind: 'runtime',
      target: { url: 'file:///app/node_modules/import-in-the-middle/lib/register.js', format: 'commonjs' },
      external: false
    },
    {
      specifier: './__iitm_module_0__.js',
      kind: 'module',
      target: { url: 'file:///app/node_modules/pkg/index.js', format: 'module' },
      external: false
    }
  ],
  watchFiles: ['file:///app/node_modules/pkg/index.js', 'file:///app/node_modules/pkg/more.js'],
  sideEffects: true
}
```

* `code` imports only the relative placeholders listed in `imports`. They are
  deterministic: `./__iitm_runtime__.js`, then `./__iitm_module_<n>__.js`
  numbered from `0` in the order the facade first uses each target.
  **`./__iitm_module_0__.js` (`imports[1]`) is always the wrapped module
  itself**, whose `target.url` equals `url`. Two facades use the same
  placeholders, so resolve them per importing facade. `code` is not
  self-contained: a caller that caches it must cache `imports` with it.
* Each `imports` entry maps a placeholder to its `target`: the canonical `url`
  and, when known, the `format` (`load`'s, else `resolve`'s, `builtin` for
  `node:` URLs, `commonjs` for the runtime). `external` is `true` for builtins.
  Resolving each placeholder is the caller's job: a bundler serves `code` as a
  virtual module and maps placeholders in its resolve hook, and a
  `module.registerHooks()` hook does the same keyed by `parentURL`. Filesystem
  paths, virtual IDs, external modules and cache invalidation stay with the
  caller.
* `kind: 'module'` targets a module the facade reads bindings from:
  * The **wrapped module** (`./__iitm_module_0__.js`) must load the original,
    unwrapped module, never the facade, or the facade imports itself. A loader
    serving the facade at `url` resolves it to an alias that bypasses the facade
    (for example `${url}?original`).
  * **Any other module entry** is the defining module of a re-exported name.
    Resolve it normally, to the same instance the wrapped module's own
    `export *` chain uses, as IITM's loader does. Routing it to a separate
    "original" copy evaluates that module twice.
  * In a bundler, give the **facade** its own ID or namespace and leave the
    original at its normal ID. The reverse, moving the original to a separate
    namespace, loads a second copy whenever an import of the wrapped file that
    your plugin does not route itself (a self-import, a relative or a deep
    import) reaches the normal ID.
* `kind: 'runtime'` targets IITM's registration runtime (`lib/register.js` of
  this copy, as a `file:` URL of its real path, CommonJS). It must load the
  **same instance** that your `Hook`/`addHook` calls use. If your tool keeps
  symlinked paths (for example esbuild's `preserveSymlinks`), resolve it to the
  path your `import-in-the-middle` import resolves to. The URL is computed from
  the location of `wrapper.mjs`, so keep `import-in-the-middle` external when
  bundling the tool that calls `createWrapperModule`.
* `watchFiles` lists, deduplicated in first-seen order, every `file:` module
  analyzed (the root first, unless it is a builtin or not a `file:` URL) and the
  adapters' `watchFiles`. Each call collects its own. Because the facade's
  export list depends on modules it never imports, such as the targets of
  `export *` chains, add these as watch dependencies so a rebuild picks up
  changed exports. Files your adapters consult on their own, such as a
  `package.json` read to decide between ESM and CommonJS, are only included if
  the adapters report them in `watchFiles`.
* `sideEffects: true` marks the facade as having side effects: evaluating it
  registers the module, so a bundler must not tree-shake it away.

Registration, and therefore hook matching, always uses `url`. Placeholders
change only the emitted imports.

```js
// Sketch of a bundler plugin resolving the placeholders of a facade it serves
// under its own ID (for example in a separate namespace).
const wrapper = await createWrapperModule({ url, source, specifier, resolve, load })
facades.set(facadeId, { url, imports: wrapper.imports })
for (const file of wrapper.watchFiles) addWatchFile(fileURLToPath(file))

function resolvePlaceholder (specifier, importer) {
  const facade = facades.get(importer)
  const entry = facade?.imports.find((entry) => entry.specifier === specifier)
  if (entry === undefined) return undefined
  const { kind, target, external } = entry
  if (external) return { id: target.url, external: true }
  if (kind === 'module' && target.url === facade.url) {
    // The wrapped module: its normal ID, marked so the plugin does not wrap it again.
    return { id: fileURLToPath(target.url), skipWrapping: true }
  }
  // Other modules and the runtime: their normal IDs, handled as usual.
  return { id: fileURLToPath(target.url) }
}
```

**Runtime registry.** Facades and `Hook`/`addHook` must share one copy of
`import-in-the-middle`, either consistently bundled and deduplicated or
consistently external. With two copies, registrations land in a registry the
hooks never see. Registries are not bridged between copies.

**Errors and caching.** Errors are thrown or rejected; nothing falls back to the
unwrapped module and no warning is emitted, so the caller decides what to do.
Adapter errors and contract violations surface as they were raised, except
below a CommonJS re-export: there they are wrapped in a `Failed to parse` error
for the re-exporting module, with the original error as its `cause`, as the
loader reports such failures.
Every call analyzes the graph from scratch and shares no export cache with the
loader or with other calls, so a rebuild that changes a module's exports at the
same URL is picked up. The loader's own caching is unchanged.

**Semantics.** A facade is a separate module that re-exports the original
module's bindings. As with the loader, exports replaced by a hook are visible
through the facade, while later reassignments inside the original module are
only partially reflected. Code that reaches the original module directly, for
example through the alias, bypasses the facade, and an aliased original sees the
alias as its `import.meta.url`. The loader's handling of circular
`export *` graphs, which rewrites the modules that close the cycle, is not
applied: the facade is generated as for an acyclic graph. Export names of builtins and of CommonJS modules
are computed by the Node.js runtime that runs `createWrapperModule`, which may
differ from the runtime the output targets. A name that the target runtime
lacks is still exported by the facade, with the value `undefined`.

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
  returns.
* A module's static imports and their resolved URLs must remain stable.
  The cycle detector caches import metadata by module URL.
