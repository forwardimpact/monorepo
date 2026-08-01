# Configuration and supervision libraries

Three libraries form the config-to-runtime pipeline.

## `libconfig`

The `Config` class carries namespace-specific factories:

| Factory | Namespace | Config path | Env prefix |
|---|---|---|---|
| `createServiceConfig(name)` | `service` | `service.<name>` | `SERVICE_{NAME}_*` |
| `createProductConfig(name)` | `product` | `product.<name>` | `PRODUCT_{NAME}_*` |
| `createInitConfig()` | `init` | `init` | — |
| `createExtensionConfig(name)` | `extension` | `extension.<name>` | `EXTENSION_{NAME}_*` |
| `createScriptConfig(name)` | `script` | `script.<name>` | `SCRIPT_{NAME}_*` |

Merge order: constructor defaults → `config.json` block → `.env`.
Non-credential keys overwrite `process.env` unconditionally from `.env`.
Credential keys go to a private map. Shell env wins at read time for
credentials only.

## `librc`

`ServiceManager` reads `init.services` through `createInitConfig()` and
delegates to `libsupervise` (svscan) for process supervision. The CLI is
`fit-rc`.

Scope rule: named `start`/`stop`/`restart` operate on the target and
everything after it. Services before the target stay untouched. A named
`start` reuses the svscan daemon that already runs. A full `start` (no name)
restarts it.

## `libsupervise`

`libsupervise` is a daemontools-style process supervisor. `fit-rc` is the only
consumer. Services and products do not import `libsupervise` directly.
