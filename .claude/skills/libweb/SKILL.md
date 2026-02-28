---
name: libweb
description: >
  libweb - Shared web utilities and security middleware for Hono. AuthMiddleware
  provides HS256 JWT authentication. CorsMiddleware configures CORS headers.
  ValidationMiddleware validates and sanitizes request input with XSS protection.
  Factory functions createAuthMiddleware, createCorsMiddleware,
  createValidationMiddleware simplify setup. Use for web security, request
  validation, and middleware composition.
---

# libweb Skill

## When to Use

- Adding JWT authentication to Hono web applications
- Configuring CORS for API endpoints
- Validating and sanitizing request input
- Protecting against XSS attacks in user input

## Key Concepts

**Middleware interface**: All middleware classes implement `create()` returning
a Hono middleware function.

**AuthMiddleware**: Verifies HS256 JWT tokens, validates expiration, audience,
and algorithm. Supports optional authentication mode.

**ValidationMiddleware**: Schema-driven validation with required fields, type
checking, length limits, and HTML escaping for XSS prevention.

## Usage Patterns

### Pattern 1: JWT authentication

```javascript
import { createAuthMiddleware } from "@forwardimpact/libweb";

const auth = createAuthMiddleware(config);
app.use(auth.create());                       // Required auth
app.use(auth.create({ optional: true }));     // Optional auth
```

### Pattern 2: Input validation

```javascript
import { createValidationMiddleware } from "@forwardimpact/libweb";

const validation = createValidationMiddleware();
app.post("/messages", validation.create({
  required: ["message", "user_id"],
  types: { message: "string", count: "number" },
  maxLengths: { message: 500 },
}), handler);
```

### Pattern 3: CORS configuration

```javascript
import { createCorsMiddleware } from "@forwardimpact/libweb";

const cors = createCorsMiddleware();
app.use(cors.create({ origin: ["https://app.example.com"] }));
```

## Integration

Used by web service for HTTP API security. Depends on libconfig for JWT secret
configuration and Hono for middleware composition.
