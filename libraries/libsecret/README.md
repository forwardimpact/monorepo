# libsecret

<!-- BEGIN:description — Do not edit. Generated from package.json. -->

Secret generation, JWT signing, and .env file management for services and CLIs.

<!-- END:description -->

## Getting Started

```js
import {
  generateSecret,
  generateUUID,
  generateJWT,
  mintSupabaseJwt,
  mintSupabaseAnonKey,
  mintSupabaseServiceRoleKey,
} from '@forwardimpact/libsecret';
```

- `mintSupabaseJwt({ email, secret, ttlSeconds })` — per-caller HS256 token
  signed against the Supabase JWT secret.
- `mintSupabaseAnonKey({ secret })` — long-lived `role: anon` token used by
  Supabase Auth's anon-keyed clients.
- `mintSupabaseServiceRoleKey({ secret })` — long-lived `role: service_role`
  token used for admin operations against Supabase.
