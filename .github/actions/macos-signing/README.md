# macos-signing

This action imports Apple **Developer ID** certificates into a temporary
keychain. The release workflows can then codesign and notarize macOS bundles.
Without it, the build signs bundles ad-hoc only. Gatekeeper then blocks the
download ("Apple could not verify … is free of malware").

`publish-binaries.yml`'s `package` job uses this action. That job signs both
the `.app` (cask) and the `.pkg` (outpost) on one runner.

## Secret isolation — environment scope, never repo scope

All signing material lives in the **`macos-signing` GitHub Environment**,
**never** in repository or organization secrets. GitHub only exposes
environment secrets to a job that declares `environment: macos-signing`. The
`publish-*` build jobs declare it. The `kata-*` agent workflows do not. So
agents in this repo structurally cannot read the certificates or the notary
key.

Harden the environment further (Settings → Environments → `macos-signing`):

- **Deployment tag rule** — restrict to `*@v*` so only release tags use it.
- **Required reviewers** (optional) — a human approves each signed release.

A change to this boundary is a security-engineer decision. A secret moved to
repo scope is one such change.

## Required environment secrets

Encode each file with base64 (`base64 -i cert.p12 | pbcopy`). Both certs come
from one Apple Developer Program membership ($99/yr).

| Secret | Purpose |
|---|---|
| `APPLE_DEV_ID_APP_P12_BASE64` | Developer ID **Application** cert (.p12) — signs the `.app` and inner binaries |
| `APPLE_DEV_ID_APP_P12_PASSWORD` | Password for the Application `.p12` |
| `APPLE_DEV_ID_INSTALLER_P12_BASE64` | Developer ID **Installer** cert (.p12) — signs the `.pkg` |
| `APPLE_DEV_ID_INSTALLER_P12_PASSWORD` | Password for the Installer `.p12` |
| `APPLE_API_KEY_P8_BASE64` | App Store Connect API key (.p8) for `notarytool` |
| `APPLE_API_KEY_ID` | API key ID |
| `APPLE_API_ISSUER_ID` | API key issuer ID |

The `package` job uses the Application cert for the `.app`. It uses the
Installer cert for the `.pkg` (outpost only). It uses the API key to notarize
both.

## How it fits together

1. **This action** decodes each certificate into a temporary keychain. It then
   exports `MACOS_SIGN_IDENTITY` (and `MACOS_INSTALLER_IDENTITY` when present)
   to the job environment, and `enabled=true` as an output.
2. **`libmacos/scripts/sign-app.sh`** signs the bundle with
   `MACOS_SIGN_IDENTITY` (Developer ID + secure timestamp + hardened runtime).
   It signs inside-out and deterministically. So the cdhash stays stable. The
   current "verify cdhash stability" guard then still protects TCC grants
   across upgrades.
3. **`products/outpost/pkg/macos/build-pkg.sh`** signs the `.pkg` with
   `MACOS_INSTALLER_IDENTITY` through `productbuild --sign`.
4. The workflow then **notarizes** the artifact (`xcrun notarytool submit
   --wait`, API key) and **staples** the ticket (`xcrun stapler staple`). So
   Gatekeeper passes offline. The cask installs with no dialog.

## The gate

When `app-cert-base64` is empty (no environment or secrets), the action sets
`enabled=false`. The build then signs the bundle ad-hoc. The workflow skips the
notarize steps (`if: steps.signing.outputs.enabled == 'true'`). So PR builds
and local builds stay unaffected until the secrets exist.

## Inputs / outputs

| Input | Required | Description |
|---|---|---|
| `app-cert-base64` / `app-cert-password` | no | Developer ID Application `.p12` |
| `installer-cert-base64` / `installer-cert-password` | no | Developer ID Installer `.p12` |

| Output | Description |
|---|---|
| `enabled` | `true` when the action imported a certificate |
| `app-identity` / `installer-identity` | Resolved identity names |
