# Facade integration guide

The experimental [facade API](../README.md#generating-facades-without-the-loader-experimental)
generates wrappers for tools that own module loading. The host remains
responsible for source transforms, resolution, module identity and rebuilds.
See [wrapper.d.mts](../wrapper.d.mts) for the API contracts.

## Module identity

Keep a manifest of `imports` for each facade. The generated code uses relative
placeholders, and different facades reuse the same placeholder names, so resolve
them against the importing facade, not a global placeholder map. Registration
and hook matching always use the canonical `url` supplied to the generator.

In a bundler, give the facade its own ID or namespace and leave the original at
its normal ID. Moving the original into a separate namespace can evaluate it
twice if a self-import, relative import or deep import reaches its normal ID.
Generate facades before bundling removes module boundaries, and preserve their
registration side effects when tree-shaking.

For each manifest entry:

* `original` must reach the unwrapped module without generating another facade.
  If a loader serves the facade at the original URL, use an alias such as
  `${url}?original` to bypass wrapping. That alias becomes the original's
  `import.meta.url`.
* `module` must reach the same instance used by the original's re-export chain.
  Do not give these dependencies separate "original" copies.
* `runtime` must reach the instance used by `Hook`/`addHook`. If the host
  preserves symlinks, map it to the path its `import-in-the-middle` import uses.

The manifest reports effective loader formats when known. Builtins have `node:`
URLs and format `builtin`; leave them external in a Node.js bundle. The runtime
is CommonJS, provided as a `file:` URL. Its URL is derived from the installed
generator's location, so keep `import-in-the-middle` external when bundling the
tool that calls the generator.

The [synchronous hook integration test](../test/wrapper/v22.15-sync-hook.mjs)
is an end-to-end example of mapping placeholders, bypassing the facade for the
original, and sharing a module instance between `import` and `require(esm)`.

## Graph analysis and rebuilds

Adapters should use the same resolution rules and transformed sources as the
host's actual module graph. Resolve re-export specifiers as written, including
relative specifiers and package `#imports`, against the provided `parentURL`.
The `kind` distinguishes ESM imports from CommonJS `require` re-exports, which
may need different package conditions.

Analysis requests only sources needed to discover exports, not every imported
module. The root source is supplied directly and builtins are inspected without
`load`. CommonJS re-exports of `.json` and `.node` targets are resolved but not
loaded. Prefer explicit formats from your host; if both adapters omit the
format, IITM treats source with ESM syntax as ESM and otherwise analyzes it as
CommonJS. A format returned by `load` takes precedence over `resolve`.

Each generation call analyzes the graph independently, so changed exports at
the same URL are picked up on a rebuild. To invalidate cached facades, track:

* The root source.
* Every module whose source your `load` adapter supplies, including transitive
  `export *` targets that the generated facade does not import directly.
* Resolution or transform inputs your adapters consult, such as `package.json`.

Adapters may cache their own work, but must invalidate it consistently with the
host. Cache the generated `code` and its `imports` manifest together.

## Behavioral differences

Hooks replace bindings exposed by the facade; accessing the original module
directly bypasses interception. Later reassignments inside the original are
only partially reflected in the facade, as with IITM's loader.

The generator discovers names through circular `export *` chains, but does not
apply the loader's cycle-specific module rewrites. Do not assume it preserves
the loader's circular initialization behavior.

Builtin and CommonJS export names depend on the Node.js runtime running the
generator. If the target runtime lacks a generated export name, the facade
still exports it with the value `undefined`.
