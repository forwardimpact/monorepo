import { createHttpService } from "@forwardimpact/libhttp";
import * as types from "@forwardimpact/libtype";
import { JwksCache } from "./src/jwks-cache.js";
import { OidcValidator } from "./src/oidc-validator.js";
import { registerTokenRoute } from "./src/handlers.js";

export { JwksCache } from "./src/jwks-cache.js";
export { OidcValidator, OidcError } from "./src/oidc-validator.js";
export { statusForError, registerTokenRoute } from "./src/handlers.js";

/**
 * Create the GitHub Actions OIDC exchange HTTP front.
 *
 * Transport boilerplate (security headers, error envelope, `/health`,
 * lifecycle) is owned by `@forwardimpact/libhttp`; this factory builds
 * the JWKS cache and validator, then mounts the `POST /token` route that
 * delegates minting to the configured provider backend over gRPC. The
 * service holds no signing material — it mirrors the
 * `services/oauth` → `services/ghuser` protocol-front pattern.
 *
 * @param {object} options
 * @param {object} options.config
 * @param {object} options.logger
 * @param {object} [options.tracer]
 * @param {object} options.providerClient - gRPC client for the mint backend.
 * @param {import("@forwardimpact/libutil/runtime").Runtime["clock"]} options.clock
 * @param {typeof fetch} [options.fetch] - Injected fetch (defaults to global).
 * @returns {{ app: import("hono").Hono, address: () => object|null, start: () => Promise<void>, stop: () => Promise<void> }}
 */
export function createOidcService({
  config,
  logger,
  tracer,
  providerClient,
  clock,
  fetch: fetchFn = fetch,
}) {
  if (!clock) throw new Error("clock is required");

  const providerTypes = types[config.provider];
  const typed = (name, obj) => providerTypes[name].fromObject(obj);

  const jwks = new JwksCache({
    clock,
    fetch: fetchFn,
    issuer: config.issuer,
    ttl_ms: config.jwks_ttl_ms,
    cooldown_ms: config.jwks_cooldown_ms,
  });
  const validator = new OidcValidator({
    jwks,
    issuer: config.issuer,
    audience: config.audience,
  });

  return createHttpService({
    name: "oidc",
    config,
    logger,
    tracer,
    configure(app) {
      registerTokenRoute(app, { validator, providerClient, typed });
    },
  });
}
