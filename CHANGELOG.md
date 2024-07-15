# Changelog

## [1.9.1](https://github.com/nodejs/import-in-the-middle/compare/import-in-the-middle-v1.9.0...import-in-the-middle-v1.9.1) (2024-07-15)


### Bug Fixes

* Don't wrap native modules ([#142](https://github.com/nodejs/import-in-the-middle/issues/142)) ([f3278a3](https://github.com/nodejs/import-in-the-middle/commit/f3278a3c76af78fe369b599d5b2bf1d87edf0a7a))
* Use correct `format` when resolving exports from sub-modules ([#140](https://github.com/nodejs/import-in-the-middle/issues/140)) ([1db08ef](https://github.com/nodejs/import-in-the-middle/commit/1db08ef5f51346c20b4b3c313bf993e9cf1ca7d5))

## [1.9.0](https://github.com/nodejs/import-in-the-middle/compare/import-in-the-middle-v1.8.1...import-in-the-middle-v1.9.0) (2024-07-08)


### Features

* Allow passing of `include` or `exclude` list via `module.register()` ([#124](https://github.com/nodejs/import-in-the-middle/issues/124)) ([381f48c](https://github.com/nodejs/import-in-the-middle/commit/381f48c07ff755e88495f688c75c4912926194c7))


### Bug Fixes

* CJS `require('.')` resolution ([#108](https://github.com/nodejs/import-in-the-middle/issues/108)) ([29c77b5](https://github.com/nodejs/import-in-the-middle/commit/29c77b560aec0429154632c950923d12db36f79e))
* Include source url for parsing failures ([#109](https://github.com/nodejs/import-in-the-middle/issues/109)) ([49d69ba](https://github.com/nodejs/import-in-the-middle/commit/49d69ba9e785d4b6a1b38d7da1293cb744b6d7e3))
* Use `process.emitWarning` to log wrapping errors ([#114](https://github.com/nodejs/import-in-the-middle/issues/114)) ([a3778ac](https://github.com/nodejs/import-in-the-middle/commit/a3778acfbe2220ce5d521232b41da23b4383e1e3))
