---
title: Sign In to Landmark
description: Sign in via Supabase magic-link so Landmark commands resolve your identity without managing a long-lived token.
---

Every Landmark read requires an authenticated caller. The privacy substrate
keys row-level security off the JWT's `email` claim, so before any verb can
return data it needs to know who is asking.

`fit-landmark login` walks you through Supabase's magic-link flow, captures
the session at a localhost callback, and stores it under
`~/.config/landmark/credentials.json` (0600). Subsequent commands resolve
identity automatically; you only run `login` again when the session expires
or you change machines.

This guide is for **engineers** signing in to read Landmark from the CLI.
Operators issuing tokens for unattended agents follow a different path —
see [Issue Service-Account Tokens](https://www.forwardimpact.team/docs/products/issuing-service-account-tokens/index.md).

## Prerequisites

- An `auth.users` row paired with your roster entry. Your operator runs
  `fit-map people provision` to keep these synchronized — if your email is
  not in the roster, login will fail.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` available in your environment.
  Local installs get these in `.env` from `just env-setup`; hosted
  Supabase projects expose them in Project Settings → API.

## Browser flow (default)

```sh
fit-landmark login --email you@example.com
```

The CLI starts a listener on `127.0.0.1` and prints a port. Supabase emails
you a magic-link; clicking it from the same machine redirects the browser
to the listener, which captures the PKCE code and exchanges it for a
session. The credentials file is written with mode 0600.

```
Sent a magic link to you@example.com.
Open the email on this machine and click the link — the CLI is listening on 127.0.0.1:54321.
Logged in as you@example.com.
```

## OTP flow (headless / SSH)

When you cannot open a browser on the machine running the CLI — an SSH
session, a sandboxed agent, a container — use the OTP flow instead:

```sh
fit-landmark login --otp --email you@example.com
```

Supabase emails you a six-digit code. Paste it at the prompt; the CLI
verifies it and persists the same session shape as the browser flow.

```
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
Treat it like an SSH private key — never commit it, never copy it to a
shared filesystem. The 0600 permission is enforced on POSIX systems.

You can override the path with `LANDMARK_CREDENTIALS_FILE`; useful for
isolating sessions per project or for test harnesses.

## When the session expires

Supabase access tokens are short-lived (an hour by default) but the
refresh token persists for weeks. The Landmark identity resolver checks
`expires_at` on every command and calls Supabase's refresh endpoint
automatically when the access token is within a minute of expiry. The
refreshed tokens are written back to the same credentials file.

When the refresh token itself has aged out, you'll see:

```
Authentication required: session expired and refresh failed — run `fit-landmark login` again
```

Run `fit-landmark login` again to start a new session.

## Sign out

```sh
fit-landmark logout
```

Removes the credentials file. A subsequent `login` starts fresh.

## Power-user override

If you have been issued a long-lived JWT (operator-minted via
`fit-map auth issue`), export it as `PRODUCT_LANDMARK_TOKEN` and the resolver
will skip the credentials store entirely:

```sh
export PRODUCT_LANDMARK_TOKEN=<jwt>
fit-landmark voice
```

This is the path unattended agents take. Treat the token like a credential —
it grants the same scope your magic-link session would.

## What's next

<div class="grid">

<!-- part:card:../growth-areas -->
<!-- part:card:../engineering-data-sources -->
<!-- part:card:../issuing-service-account-tokens -->

</div>
