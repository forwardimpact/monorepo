import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { requireAgentFlag } from "../src/util/agent-flag.js";

describe("requireAgentFlag", () => {
  test("returns the agent when --agent is present", () => {
    const r = requireAgentFlag(
      { agent: "staff-engineer" },
      { command: "rotate", example: "fit-wiki rotate --agent staff-engineer" },
    );
    assert.deepEqual(r, { ok: true, agent: "staff-engineer" });
  });

  test("fails closed when --agent is absent, naming the flag and an example", () => {
    const r = requireAgentFlag(
      {},
      { command: "boot", example: "fit-wiki boot --agent staff-engineer" },
    );
    assert.equal(r.ok, false);
    assert.equal(r.code, 2);
    assert.match(r.error, /^boot requires --agent <name>; e\.g\. /);
    assert.ok(r.error.includes("fit-wiki boot --agent staff-engineer"));
  });

  test("never mentions an environment variable in the error", () => {
    const r = requireAgentFlag(
      {},
      { command: "claim", example: "fit-wiki claim --agent x" },
    );
    assert.doesNotMatch(r.error, /LIBEVAL_AGENT_PROFILE/);
    assert.doesNotMatch(r.error, /env/i);
  });

  test("keys on --from for memo", () => {
    const ok = requireAgentFlag(
      { from: "security-engineer" },
      { command: "memo", flag: "--from", example: "fit-wiki memo --from x" },
    );
    assert.deepEqual(ok, { ok: true, agent: "security-engineer" });

    const missing = requireAgentFlag(
      { agent: "ignored-when-flag-is-from" },
      { command: "memo", flag: "--from", example: "fit-wiki memo --from x" },
    );
    assert.equal(missing.ok, false);
    assert.match(missing.error, /^memo requires --from <name>; e\.g\. /);
  });

  test("is pure — reads no environment", () => {
    // No env set, no fs touched; the function only sees its options arg.
    const r = requireAgentFlag({}, { command: "log", example: "x" });
    assert.equal(r.ok, false);
  });
});
