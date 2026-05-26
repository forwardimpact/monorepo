# Spec 0810 — Outpost Mail Sync Attachment Path-Traversal

## Problem

Outpost's `sync-apple-mail` skill writes Apple Mail attachments to the user's
home directory using an attacker-controlled filename without sanitization,
allowing arbitrary file write outside the intended attachments directory.

`products/outpost/templates/.claude/skills/sync-apple-mail/scripts/sync-helpers.mjs`
(`copySingleAttachment`, lines 276-304) takes the attachment name from the
Apple Mail Envelope Index DB column `attachments.name` — which preserves the
filename from the email's MIME `Content-Disposition: attachment; filename=`
header, set by the sender — and passes it to `path.join(destDir, destName)`
where `destDir = ~/.cache/fit/outpost/apple_mail/attachments/<threadId>/`.
`path.join` normalises `..` segments, so a filename like
`../../../../Library/LaunchAgents/com.evil.plist` resolves to a path outside
`destDir`.

The full attack chain is reachable end-to-end with no user interaction beyond
having Outpost installed:

| Step | Actor | Action |
|---|---|---|
| 1 | Remote attacker | Sends email to victim with attachment whose `Content-Disposition` filename contains `..` segments. |
| 2 | macOS Mail.app | Stores the email; `attachments.name` retains the attacker's filename verbatim. |
| 3 | Outpost `postman` agent (every 5 min) | Runs `sync-apple-mail`, which calls `copySingleAttachment`. |
| 4 | `copyFileSync(source, destPath)` | Writes attacker-controlled bytes (the attachment payload) to attacker-controlled path under `$HOME`. |

Because the macOS user has write access to `~/Library/LaunchAgents/`,
`~/.zshrc`, `~/.ssh/authorized_keys`, `~/Library/Application Support/Code/User/settings.json`,
and similar files, a malicious attachment achieves persistence and code
execution at next user login (LaunchAgents) or shell start (rc files). No
exploit primitives are missing — the attacker controls both the target path
and the file content.

This is a **HIGH severity** finding: pre-auth (sending email to a published
address suffices), reliable (sync runs every 5 minutes by default), and
high-impact (LPE / persistence under the victim's account).

---

## Personas and Jobs

| Persona | Job | How the gap blocks progress |
|---|---|---|
| Empowered Engineers | Be Prepared and Productive — "keep track of people, projects, and threads without depending on memory" ([JTBD.md](../../JTBD.md)) | A personal knowledge assistant that lives locally cannot be the vector for remote arbitrary file write under the user's account. |

---

## Scope

### In scope

| File | What changes |
|---|---|
| `products/outpost/templates/.claude/skills/sync-apple-mail/scripts/sync-helpers.mjs` | `copySingleAttachment` (lines 276-304) sanitises the filename so the resulting `destPath` cannot escape its per-thread `attachments/<tid>/` directory. |
| `products/outpost/test/` (new file or sync-helpers test added there) | Unit test exercising the sanitisation against the worked-example payloads listed under § Success Criteria. |

### Out of scope

- The `att.name` rendering in `sync.mjs:94` (markdown link text and link
  target). The residual there is content-injection only — a `..`-bearing
  name skews where the rendered link points at click-time, not arbitrary
  file write. Sanitisation should still be applied for display consistency,
  but it is not the security fix.
- Defense-in-depth changes to other Outpost templates (e.g. `sync-teams`,
  `sync-apple-calendar`). Those slugs/IDs already pass through numeric or
  regex-restricted slug builders; out of scope here, separate audit if
  needed.
- The TOCTOU window between Unix-domain `socket.listen()` and `chmod 0o600`
  in `socket-server.js`. Real but lower-impact; defer.
- Hardening of `path.join` consumers across `libraries/`. Already covered by
  prior pass (PR #730 libwiki memo containment, libsecret 0o600).

---

## Success Criteria

| Claim | Verification |
|---|---|
| No `att.name` value can produce a `destPath` outside `destDir`; the sanitised name is a single basename, never empty, never `.` or `..`. | Unit test of the sanitiser in isolation: `"../../../foo"`, `"/etc/passwd"`, `"..\\..\\..\\foo"`, `"\u0000bar"`, `"."`, `".."`, `""`, `null` each yield a single-basename string that is non-empty and not `.`/`..`. |
| `copySingleAttachment` cannot write outside its `destDir`. | Integration-style test: with a fake `attachmentIndex` source and `att.name = "../../../escape.txt"`, the resolved `destPath` either equals `<destDir>/<sanitised>` or the call returns `{ available: false }` — never writes outside `destDir`. |
| Real-world attachment names — including non-ASCII — round-trip unchanged through the sanitiser. | Unit test of the sanitiser in isolation (not the `copySingleAttachment` `${mid}_` collision branch): benign names `"contract.pdf"`, `"Q3 plan.xlsx"`, `"image (2).png"`, `"café résumé.pdf"` survive byte-for-byte. |

— Security Engineer 🔒
