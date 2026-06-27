# libpreflight

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Fail fast at process start with product-authored errors — runtime-floor checks
and required-config assertions before heavy imports resolve.

<!-- END:description -->

## Usage

Import the side-effect entry as the **first** import in every published CLI
entry script. The package has zero production dependencies, so ESM
post-order evaluation guarantees the floor check runs before any sibling
import body executes.

```js
#!/usr/bin/env node
import "@forwardimpact/libpreflight/node22";

// the rest of the bin's imports
```

Under Node `>=22` the import returns silently. Under Node `<22` the process
writes two lines to stderr and exits `1`:

```text
Error: This command requires Node.js 22 or later (running 20.11.0).
Install Node.js 22 (LTS) from https://nodejs.org/ and re-run.
```

The failure intercepts the bin before any heavy static import — including
upstream packages whose constructors may raise their own runtime-floor
errors — evaluates.

## Testable helper

For unit tests, import the parameterised `check`:

```js
import { check } from "@forwardimpact/libpreflight/check.js";

const mockProcess = {
  versions: { node: "20.11.0" },
  stderr: { write: (chunk) => { /* capture */ } },
  exit: (code) => { /* capture */ },
};
check(22, mockProcess);
```

## Required-config assertion

Call `assertNonEmpty(value, label)` from `server.js` immediately after
`createServiceConfig` to fail the process at startup if a required
configuration value is empty. Empty means an empty string, an empty array,
an empty `Set`, or `undefined`/`null`.

```js
import { assertNonEmpty } from "@forwardimpact/libpreflight/assert-non-empty.js";

const config = createServiceConfig("svc", { link_completion_ticket_secret: "" });
assertNonEmpty(config.link_completion_ticket_secret, "link_completion_ticket_secret");
```

On failure the process writes
`Error: required configuration "<label>" is empty.` to stderr and exits `1`.
A test injects a `processObj` exposing `stderr.write` and `exit`.

## Why a side-effect import per floor

Encoding the floor in the subpath (`./node22`, future `./node24`, …) keeps
the import statement self-describing and lets a CI invariant cross-check
the floor literal against the importing package's `engines.node`.
