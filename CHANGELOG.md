# Changelog

## [1.12.0](https://github.com/nodejs/import-in-the-middle/compare/import-in-the-middle-v1.11.3...import-in-the-middle-v1.12.0) (2024-12-13)


### Features

* Support absolute paths for `include` ([#168](https://github.com/nodejs/import-in-the-middle/issues/168)) ([d0d9bc3](https://github.com/nodejs/import-in-the-middle/commit/d0d9bc3d1e0bcef1094af58c15cf997507777067))
* Warn on multiple hook initialization ([#165](https://github.com/nodejs/import-in-the-middle/issues/165)) ([9bd539e](https://github.com/nodejs/import-in-the-middle/commit/9bd539ea6ff1684c8807bc30c8b68882cc9e057f))

## [1.11.3](https://github.com/nodejs/import-in-the-middle/compare/import-in-the-middle-v1.11.2...import-in-the-middle-v1.11.3) (2024-12-04)


### Bug Fixes

* Correct type definition for waitForAllMessagesAcknowledged ([#160](https://github.com/nodejs/import-in-the-middle/issues/160)) ([353d535](https://github.com/nodejs/import-in-the-middle/commit/353d535d1ce7ba485e137bcf3db08bbddd6b31d6))

## [1.11.2](https://github.com/nodejs/import-in-the-middle/compare/import-in-the-middle-v1.11.1...import-in-the-middle-v1.11.2) (2024-09-30)


### Bug Fixes

* do nothing if target does not exist in getters map ([#155](https://github.com/nodejs/import-in-the-middle/issues/155)) ([5f6be49](https://github.com/nodejs/import-in-the-middle/commit/5f6be494fc11caf8dcf900807c5b6b646fcd8d74))

## [1.11.1](https://github.com/nodejs/import-in-the-middle/compare/import-in-the-middle-v1.11.0...import-in-the-middle-v1.11.1) (2024-09-26)


### Bug Fixes

* Support Hooking multiple times ([#153](https://github.com/nodejs/import-in-the-middle/issues/153)) ([e0d8080](https://github.com/nodejs/import-in-the-middle/commit/e0d808041eff228f4b4519454f7eea8f0930238a))

## [1.11.0](https://github.com/nodejs/import-in-the-middle/compare/import-in-the-middle-v1.10.0...import-in-the-middle-v1.11.0) (2024-07-29)


### Features

* Optionally only wrap modules hooked in `--import` ([#146](https://github.com/nodejs/import-in-the-middle/issues/146)) ([71c8d7b](https://github.com/nodejs/import-in-the-middle/commit/71c8d7bac512df94566d12c96fc2e438b4de2e2a))


### Bug Fixes

* `node:` prefixed build-in modules with `include`/`exclude` ([#149](https://github.com/nodejs/import-in-the-middle/issues/149)) ([736a944](https://github.com/nodejs/import-in-the-middle/commit/736a9446e209bc8649801a27cb431df663551dc5))

## [1.10.0](https://github.com/nodejs/import-in-the-middle/compare/import-in-the-middle-v1.9.1...import-in-the-middle-v1.10.0) (2024-07-22)


### Features

* Allow regex for `include` and `exclude` options ([#148](https://github.com/nodejs/import-in-the-middle/issues/148)) ([697b0d2](https://github.com/nodejs/import-in-the-middle/commit/697b0d239b9a738f4952bb0f77c521c4a398ac79))


### Bug Fixes

* Use correct `format` when resolving exports from relative paths ([#145](https://github.com/nodejs/import-in-the-middle/issues/145)) ([632802f](https://github.com/nodejs/import-in-the-middle/commit/632802f4e7c797215b4e052ffdfa0fbda1780166))

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
