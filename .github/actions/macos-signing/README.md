# macos-signing

Imports Apple **Developer ID** certificates into a temporary keychain so the
release workflows can codesign and notarize macOS bundles. Without it, bundles
are only ad-hoc signed and Gatekeeper blocks the download ("Apple could not
verify … is free of malware").

Used by `publish-macos.yml` (`.pkg`) and `publish-brew.yml` (`.app` / cask).

## Secret isolation — environment-scoped, not repo

All signing material is stored in the **`macos-signing` GitHub Environment**,
**never** as repository or organization secrets. GitHub only exposes
environment secrets to a job that declares `environment: macos-signing`. The
`publish-*` build jobs declare it; `kata-*` agent workflows do not, so agents
running in this repo structurally cannot read the certificates or notary key.

Harden the environment further (Settings → Environments → `macos-signing`):

- **Deployment tag rule** — restrict to `*@v*` so only release tags use it.
- **Required reviewers** (optional) — a human approves each signed release.

Changing this boundary (e.g. moving a secret to repo scope) is a
security-engineer decision.

## Required environment secrets

Files are base64-encoded (`base64 -i cert.p12 | pbcopy`). Both certs come from
one Apple Developer Program membership ($99/yr).

| Secret | Purpose |
|---|---|
| `APPLE_DEV_ID_APP_P12_BASE64` | Developer ID **Application** cert (.p12) — signs the `.app` and inner binaries |
| `APPLE_DEV_ID_APP_P12_PASSWORD` | Password for the Application `.p12` |
| `APPLE_DEV_ID_INSTALLER_P12_BASE64` | Developer ID **Installer** cert (.p12) — signs the `.pkg` |
| `APPLE_DEV_ID_INSTALLER_P12_PASSWORD` | Password for the Installer `.p12` |
| `APPLE_API_KEY_P8_BASE64` | App Store Connect API key (.p8) for `notarytool` |
| `APPLE_API_KEY_ID` | API key ID |
| `APPLE_API_ISSUER_ID` | API key issuer ID |

The Installer cert and API key are only needed by `publish-macos.yml` (the
`.pkg`); `publish-brew.yml` (the `.app`) needs the Application cert and the API
key.

## How it fits together

1. **This action** decodes the cert(s) into a temporary keychain, then exports
   `MACOS_SIGN_IDENTITY` (and `MACOS_INSTALLER_IDENTITY` when present) to the
   job environment and `enabled=true` as an output.
2. **`libmacos/scripts/sign-app.sh`** signs the bundle with
   `MACOS_SIGN_IDENTITY` (Developer ID + secure timestamp + hardened runtime),
   inside-out, deterministically — so the cdhash stays stable and the existing
   "verify cdhash stability" guard still protects TCC grants across upgrades.
3. **`products/outpost/pkg/macos/build-pkg.sh`** signs the `.pkg` with
   `MACOS_INSTALLER_IDENTITY` via `productbuild --sign`.
4. The workflow then **notarizes** the artifact (`xcrun notarytool submit
   --wait`, API key) and **staples** the ticket (`xcrun stapler staple`), so
   Gatekeeper passes offline and the cask installs with no dialog.

## Gating

When `app-cert-base64` is empty (no environment / secrets), the action sets
`enabled=false`, signing falls back to ad-hoc, and the notarize steps are
skipped (`if: steps.signing.outputs.enabled == 'true'`). PR and local builds
are therefore unaffected until the secrets exist.

## Inputs / outputs

| Input | Required | Description |
|---|---|---|
| `app-cert-base64` / `app-cert-password` | no | Developer ID Application `.p12` |
| `installer-cert-base64` / `installer-cert-password` | no | Developer ID Installer `.p12` |

| Output | Description |
|---|---|
| `enabled` | `true` when a certificate was imported |
| `app-identity` / `installer-identity` | Resolved identity names |
