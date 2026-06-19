import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";

import { runInboxCommand } from "../src/commands/inbox.js";
import { MEMO_INBOX_MARKER } from "../src/constants.js";
import { makeRuntime, ctxFor } from "./helpers.js";

const WIKI_ROOT = "/wiki";
const SUMMARY = `${WIKI_ROOT}/staff-engineer.md`;

function run(subcommand, options, env = {}) {
  const fsSync = createMockFs({
    [SUMMARY]: `# Staff Engineer — Summary\n\n## Message Inbox\n\n${MEMO_INBOX_MARKER}\n\n- a memo\n`,
  });
  const harness = makeRuntime({ fsSync, env });
  const result = runInboxCommand(
    ctxFor({
      runtime: harness.runtime,
      options: { "wiki-root": WIKI_ROOT, ...options },
      args: { subcommand },
    }),
  );
  return { result, harness, fsSync };
}

describe("fit-wiki inbox CLI fail-closed contract", () => {
  test("list with --agent succeeds", () => {
    const { result, harness } = run("list", { agent: "staff-engineer" });
    assert.equal(result.ok, true);
    assert.match(harness.stdout, /a memo/);
  });

  for (const sub of ["list", "ack", "promote", "drop"]) {
    test(`${sub} without --agent fails closed (env unset)`, () => {
      const { result } = run(sub, { index: "0" });
      assert.equal(result.ok, false);
      assert.equal(result.code, 2);
      assert.match(result.error, /^inbox requires --agent <name>; e\.g\. /);
      assert.doesNotMatch(result.error, /LIBEVAL_AGENT_PROFILE/);
    });

    test(`${sub} without --agent fails closed even with env set`, () => {
      const { result, fsSync } = run(
        sub,
        { index: "0" },
        { LIBEVAL_AGENT_PROFILE: "product-manager" },
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, 2);
      // No file mutated: the source summary is byte-identical.
      assert.match(fsSync.readFileSync(SUMMARY, "utf-8"), /- a memo\n$/);
    });
  }
});
