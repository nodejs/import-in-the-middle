These tests are organized as follows:

* Located in the `hook` directory if they use the `Hook` class.
* Located in the `low-level` directory if they use the "low-level" API,
  `addHook` and `removeHook`.

The tests should be run with the `runtest` command found in this directory. If
the command exits with a non-zero code, then it's a test failure.

Running of all the tests can be done with `npm test`.

Coverage must be 100% according to `c8`. If you don't have 100% coverage, you
can run `npm run coverage` to get coverage data in HTML form.
