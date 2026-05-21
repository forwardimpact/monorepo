# libconfig

Internal contributor notes for `libconfig` consumers. Public API and bootstrap
contract: [README.md](README.md). File format and merge rules:
[`config/CLAUDE.md`](../../config/CLAUDE.md).

## Factories

`Config` class with namespace-specific factories. Each binds a top-level
`config.json` namespace and an env-variable prefix.

| Factory | Namespace | Config path | Env prefix |
|---|---|---|---|
| `createServiceConfig(name)` | `service` | `service.<name>` | `SERVICE_{NAME}_*` |
| `createProductConfig(name)` | `product` | `product.<name>` | `PRODUCT_{NAME}_*` |
| `createInitConfig()` | `init` | `init` | — |
| `createExtensionConfig(name)` | `extension` | `extension.<name>` | `EXTENSION_{NAME}_*` |
| `createScriptConfig(name)` | `script` | `script.<name>` | `SCRIPT_{NAME}_*` |

## Supervisor wiring

`librc.ServiceManager` reads `init.services` via `createInitConfig()` and
delegates to `libsupervise` (svscan, daemontools-style) for process
supervision. The CLI is `fit-rc`; nothing else imports `libsupervise` directly.
