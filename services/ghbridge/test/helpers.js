import { loadTrustedIdpOrigins } from "@forwardimpact/libutil/trusted-origins";

export { createStatefulDiscussionClient } from "@forwardimpact/libmock";

export const DEFAULT_TRUSTED_ORIGINS = loadTrustedIdpOrigins(
  "https://github.com",
);
export const DEFAULT_TICKET_SECRET = "ghbridge-test-secret";
