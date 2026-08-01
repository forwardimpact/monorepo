import { fileURLToPath } from "node:url";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

/** Shared default runtime for the profile-prompt sibling suites. */
export const RT = createDefaultRuntime();

/** Fixture profiles directory. */
export const FIXTURES = fileURLToPath(
  new URL("./fixtures/profile-prompt", import.meta.url),
);

/** The SC#1 loadability sweep reads this live `.claude/agents` directory. */
export const LIVE_PROFILES = fileURLToPath(
  new URL("../../../.claude/agents", import.meta.url),
);
