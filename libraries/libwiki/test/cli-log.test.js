import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";

import { runLogCommand } from "../src/commands/log.js";
import { makeRuntime, ctxFor } from "./helpers.js";

const WIKI_ROOT = "/wiki";

describe("fit-wiki log CLI (in-process)", () => {
  // One in-memory wiki shared across a test's log subcommands; the command
  // reads and rewrites the weekly-log file via runtime.fsSync.
  function makeWiki() {
    const fsSync = createMockFs();
    const run = (subcommand, options) => {
      const harness = makeRuntime({ fsSync });
      return runLogCommand(
        ctxFor({
          runtime: harness.runtime,
          options: { "wiki-root": WIKI_ROOT, ...options },
          args: subcommand ? { subcommand } : {},
        }),
      );
    };
    return { fsSync, run };
  }

  test("log decision writes leading ### Decision block", async () => {
    const { fsSync, run } = makeWiki();
    await run("decision", {
      agent: "staff-engineer",
      surveyed: "owned",
      chosen: "implement spec NNNN",
      rationale: "merged plan",
      today: "2026-05-19",
    });
    const expected = `${WIKI_ROOT}/staff-engineer-2026-W21.md`;
    assert.equal(fsSync.existsSync(expected), true);
    const text = fsSync.readFileSync(expected, "utf-8");
    assert.match(text, /## 2026-05-19/);
    assert.match(text, /### Decision/);
    assert.match(text, /\*\*Surveyed:\*\* owned/);
    assert.match(text, /\*\*Chosen:\*\* implement spec NNNN/);
  });

  test("log decision without --agent fails closed in both env states", async () => {
    for (const env of [{}, { LIBEVAL_AGENT_PROFILE: "product-manager" }]) {
      const fsSync = createMockFs();
      const harness = makeRuntime({ fsSync, env });
      const result = await runLogCommand(
        ctxFor({
          runtime: harness.runtime,
          options: { "wiki-root": WIKI_ROOT, today: "2026-05-19" },
          args: { subcommand: "decision" },
        }),
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, 2);
      assert.match(result.error, /^log requires --agent <name>; e\.g\. /);
      assert.doesNotMatch(result.error, /LIBEVAL_AGENT_PROFILE/);
      // No weekly log minted for any agent.
      assert.equal(
        fsSync.existsSync(`${WIKI_ROOT}/product-manager-2026-W21.md`),
        false,
      );
      assert.equal(
        fsSync.existsSync(`${WIKI_ROOT}/staff-engineer-2026-W21.md`),
        false,
      );
    }
  });

  test("missing subcommand exits 2", async () => {
    const { run } = makeWiki();
    const result = await run(undefined, { agent: "staff-engineer" });
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
  });

  test("log note appends under the open decision's date heading", async () => {
    const { fsSync, run } = makeWiki();
    const base = { agent: "staff-engineer", today: "2026-05-19" };
    await run("decision", {
      ...base,
      surveyed: "owned",
      chosen: "x",
      rationale: "y",
    });
    await run("note", { ...base, field: "Actions taken", body: "Did stuff" });
    await run("note", { ...base, field: "Findings", body: "All clean" });
    await run("done", base);

    const text = fsSync.readFileSync(
      `${WIKI_ROOT}/staff-engineer-2026-W21.md`,
      "utf-8",
    );
    const dateHeadings = text.match(/^## 2026-05-19/gm) || [];
    assert.equal(
      dateHeadings.length,
      1,
      "note/done must not start a new date heading",
    );
    assert.match(
      text,
      /### Decision[\s\S]*### Actions taken[\s\S]*### Findings[\s\S]*### Closed/,
    );
  });

  test("log note for a new day opens its own entry", async () => {
    const { fsSync, run } = makeWiki();
    const base = { agent: "staff-engineer" };
    await run("decision", {
      ...base,
      today: "2026-05-19",
      surveyed: "s",
      chosen: "c",
      rationale: "r",
    });
    await run("note", {
      ...base,
      today: "2026-05-20",
      field: "Followup",
      body: "Next day",
    });
    const text = fsSync.readFileSync(
      `${WIKI_ROOT}/staff-engineer-2026-W21.md`,
      "utf-8",
    );
    assert.match(text, /^## 2026-05-19/m);
    assert.match(text, /^## 2026-05-20/m);
  });
});

describe("fit-wiki log — budget feedback and word-cap rotation", () => {
  function runOnce(fsSync, subcommand, options) {
    const harness = makeRuntime({ fsSync });
    const r = runLogCommand(
      ctxFor({
        runtime: harness.runtime,
        options: { "wiki-root": WIKI_ROOT, ...options },
        args: { subcommand },
      }),
    );
    return { result: r, stdout: harness.stdout, stderr: harness.stderr };
  }

  test("every append reports value, cap, and remaining for both budgets (criterion 5)", () => {
    const fsSync = createMockFs();
    const { stdout } = runOnce(fsSync, "decision", {
      agent: "staff-engineer",
      today: "2026-05-19",
      surveyed: "s",
      chosen: "c",
      rationale: "r",
    });
    assert.match(
      stdout,
      /budget: \d+\/496 lines \(\d+ remaining\), \d+\/6400 words \(\d+ remaining\)/,
    );
  });
});
