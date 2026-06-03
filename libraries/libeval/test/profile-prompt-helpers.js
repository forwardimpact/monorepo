import { fileURLToPath } from "node:url";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

/** Shared default runtime for the profile-prompt sibling suites. */
export const RT = createDefaultRuntime();

/** Fixture profiles directory. */
export const FIXTURES = fileURLToPath(
  new URL("./fixtures/profile-prompt", import.meta.url),
);

/** Live `.claude/agents` directory used by the SC#1 loadability sweep. */
export const LIVE_PROFILES = fileURLToPath(
  new URL("../../../.claude/agents", import.meta.url),
);
