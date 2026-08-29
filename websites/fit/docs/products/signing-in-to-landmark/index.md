---
title: Sign In to Landmark
description: Sign in with a Supabase magic-link so Landmark commands resolve your identity. You do not manage a long-lived token.
---

Every Landmark read requires an authenticated caller. The privacy substrate
keys row-level security off the JWT's `email` claim. Before any verb can
return data, it needs to know who asks.

The `fit-landmark login` command starts Supabase's magic-link flow. It
captures the session at a localhost callback. It stores the session in
`~/.config/landmark/credentials.json` with mode 0600. Later commands resolve
identity automatically. Subject-scoped commands default `--email` to your
signed-in identity. These commands are `readiness`, `timeline`, `coverage`,
`sources`, and `voice` with no flags.

The `evidence` command stays explicit. When you omit `--email` from
`evidence`, it shows the broadest view your access allows. You only run
`login` again when the session expires or you change machines.

This guide is for **engineers** who sign in to read Landmark from the CLI.
Operators who issue tokens for unattended agents follow a different path. See
[Issue Service-Account Tokens](/docs/products/issuing-service-account-tokens/).

## Prerequisites

- An `auth.users` row paired with your roster entry. Your operator runs
  `fit-terrain substrate provision` to keep these synchronized. If your email
  is not in the roster, login fails.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` available in your environment.
  Local installs get these in `.env` from `just env-setup`. Hosted
  Supabase projects expose them in Project Settings → API.

## Browser flow (default)

```sh
fit-landmark login --email you@example.com
```

The CLI starts a listener on `127.0.0.1` and prints a port. Supabase emails
you a magic-link. Click it from the same machine. The browser then redirects
to the listener. The listener captures the PKCE code and exchanges it for a
session. The CLI writes the credentials file with mode 0600.

```text
Sent a magic link to you@example.com.
Open the email on this machine and click the link — the CLI is listening on 127.0.0.1:54321.
Logged in as you@example.com.
```

## OTP flow (headless / SSH)

You may not be able to open a browser on the machine that runs the CLI. An
SSH session, a sandboxed agent, and a container are examples. If you
cannot, use the OTP flow instead:

```sh
fit-landmark login --otp --email you@example.com
```

Supabase emails you a six-digit code. Paste it at the prompt. The CLI
verifies it and persists the same session shape as the browser flow.

```text
Sent a 6-digit code to you@example.com. Paste it below.
Code: 123456
Logged in as you@example.com.
```

## Where the session lives

| Platform | Path |
| --- | --- |
| Linux | `~/.config/landmark/credentials.json` |
| macOS | `~/Library/Application Support/landmark/credentials.json` |
| Windows | `%APPDATA%\landmark\credentials.json` |
| XDG override | `$XDG_CONFIG_HOME/landmark/credentials.json` (any platform) |

The file holds `access_token`, `refresh_token`, `expires_at`, and `email`.
Treat it like an SSH private key. Never commit it. Never copy it to a
shared filesystem. POSIX systems enforce the 0600 permission.

Override the path with `LANDMARK_CREDENTIALS_FILE` when you isolate
sessions per project or run test harnesses.

## When the session expires

Supabase access tokens expire after one hour by default. The refresh
token persists for weeks. The Landmark identity resolver checks
`expires_at` on every command. When the access token is within a minute
of expiry, the resolver calls Supabase's refresh endpoint. It writes the
refreshed tokens back to the same credentials file.

When the refresh token itself ages out, you see:

```text
Authentication required: session expired and refresh failed — run `fit-landmark login` again
```

Run `fit-landmark login` again to start a new session.

## Sign out

```sh
fit-landmark logout
```

The command removes the credentials file. The next `login` starts fresh.

## Power-user override

An operator may issue you a long-lived JWT with `fit-map auth issue`. Export
it as `PRODUCT_LANDMARK_TOKEN`. The resolver then skips the credentials store
entirely:

```sh
export PRODUCT_LANDMARK_TOKEN=<jwt>
fit-landmark voice
```

Unattended agents take this path. Treat the token like a credential.
It grants the same scope as your magic-link session.

## What's next

<div class="grid">

<!-- part:card:../growth-areas -->
<!-- part:card:../engineering-data-sources -->
<!-- part:card:../issuing-service-account-tokens -->

</div>
