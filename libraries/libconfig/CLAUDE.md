# Configuration and supervision libraries

Three libraries form the config-to-runtime pipeline. The config file format
lives in [`../../config/CLAUDE.md`](../../config/CLAUDE.md); usage from
services and products is in their respective CLAUDE.md files.

## `libconfig`

`Config` class with namespace-specific factories:

| Factory | Namespace | Config path | Env prefix |
|---|---|---|---|
| `createServiceConfig(name)` | `service` | `service.<name>` | `SERVICE_{NAME}_*` |
| `createProductConfig(name)` | `product` | `product.<name>` | `PRODUCT_{NAME}_*` |
| `createInitConfig()` | `init` | `init` | — |
| `createExtensionConfig(name)` | `extension` | `extension.<name>` | `EXTENSION_{NAME}_*` |
| `createScriptConfig(name)` | `script` | `script.<name>` | `SCRIPT_{NAME}_*` |

Merge order: constructor defaults → `config.json` block → `.env` → shell env.
Credential keys (API keys, tokens) are loaded into a private map and never
set on `process.env`.

## `librc`

`ServiceManager` reads `init.services` via `createInitConfig()` and delegates
to `libsupervise` (svscan) for process supervision. The CLI is `fit-rc`.

## `libsupervise`

Daemontools-style process supervisor. `fit-rc` is the only consumer — services
and products do not import `libsupervise` directly.
