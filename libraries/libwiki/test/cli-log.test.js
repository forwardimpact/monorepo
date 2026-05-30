import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { runLogCommand } from "../src/commands/log.js";
import { makeRuntime, ctxFor } from "./helpers.js";

describe("fit-wiki log CLI (in-process)", () => {
  let dir;
  let wikiRoot;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "log-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function run(subcommand, options) {
    const harness = makeRuntime({ cwd: dir });
    return runLogCommand(
      ctxFor({
        runtime: harness.runtime,
        options: { "wiki-root": wikiRoot, ...options },
        args: subcommand ? { subcommand } : {},
      }),
    );
  }

  test("log decision writes leading ### Decision block", async () => {
    await run("decision", {
      agent: "staff-engineer",
      surveyed: "owned",
      chosen: "implement spec NNNN",
      rationale: "merged plan",
      today: "2026-05-19",
    });
    const expected = join(wikiRoot, "staff-engineer-2026-W21.md");
    assert.equal(existsSync(expected), true);
    const text = readFileSync(expected, "utf-8");
    assert.match(text, /## 2026-05-19/);
    assert.match(text, /### Decision/);
    assert.match(text, /\*\*Surveyed:\*\* owned/);
    assert.match(text, /\*\*Chosen:\*\* implement spec NNNN/);
  });

  test("missing subcommand exits 2", async () => {
    const result = await run(undefined, { agent: "staff-engineer" });
    assert.equal(result.ok, false);
    assert.equal(result.code, 2);
  });

  test("log note appends under the open decision's date heading", async () => {
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

    const text = readFileSync(
      join(wikiRoot, "staff-engineer-2026-W21.md"),
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
    const text = readFileSync(
      join(wikiRoot, "staff-engineer-2026-W21.md"),
      "utf-8",
    );
    assert.match(text, /^## 2026-05-19/m);
    assert.match(text, /^## 2026-05-20/m);
  });
});
