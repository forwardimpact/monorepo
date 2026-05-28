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
import { createTestIo, runWithIo } from "../src/io.js";

function makeCli() {
  return {
    errors: [],
    usageError(message) {
      this.errors.push(message);
    },
  };
}

describe("fit-wiki log CLI", () => {
  let dir;
  let wikiRoot;
  let cli;
  let io;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "log-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
    cli = makeCli();
    io = createTestIo({ cwd: () => dir });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("log decision writes leading ### Decision block", async () => {
    await runWithIo(() =>
      runLogCommand(
        {
          agent: "staff-engineer",
          surveyed: "owned",
          chosen: "implement spec NNNN",
          rationale: "merged plan",
          today: "2026-05-19",
        },
        ["decision"],
        cli,
        io,
      ),
    );
    const expected = join(wikiRoot, "staff-engineer-2026-W21.md");
    assert.equal(existsSync(expected), true);
    const text = readFileSync(expected, "utf-8");
    assert.match(text, /## 2026-05-19/);
    assert.match(text, /### Decision/);
    assert.match(text, /\*\*Surveyed:\*\* owned/);
    assert.match(text, /\*\*Chosen:\*\* implement spec NNNN/);
  });

  test("missing subcommand exits 2", async () => {
    await runWithIo(() =>
      runLogCommand({ agent: "staff-engineer" }, [], cli, io),
    );
    assert.equal(io.exitCode, 2);
  });

  test("log note appends under the open decision's date heading", async () => {
    const base = { agent: "staff-engineer", today: "2026-05-19" };
    await runWithIo(() =>
      runLogCommand(
        { ...base, surveyed: "owned", chosen: "x", rationale: "y" },
        ["decision"],
        cli,
        io,
      ),
    );
    await runWithIo(() =>
      runLogCommand(
        { ...base, field: "Actions taken", body: "Did stuff" },
        ["note"],
        cli,
        io,
      ),
    );
    await runWithIo(() =>
      runLogCommand(
        { ...base, field: "Findings", body: "All clean" },
        ["note"],
        cli,
        io,
      ),
    );
    await runWithIo(() => runLogCommand(base, ["done"], cli, io));

    const text = readFileSync(
      join(wikiRoot, "staff-engineer-2026-W21.md"),
      "utf-8",
    );
    const dateHeadings = text.match(/^## 2026-05-19/gm) || [];
    assert.equal(
      dateHeadings.length,
      1,
      "note/done must not start a new date heading under the open entry",
    );
    assert.match(
      text,
      /### Decision[\s\S]*### Actions taken[\s\S]*### Findings[\s\S]*### Closed/,
    );
  });

  test("log note for a new day opens its own entry", async () => {
    const base = { agent: "staff-engineer", "wiki-root": wikiRoot };
    await runWithIo(() =>
      runLogCommand(
        {
          ...base,
          today: "2026-05-19",
          surveyed: "s",
          chosen: "c",
          rationale: "r",
        },
        ["decision"],
        cli,
        io,
      ),
    );
    await runWithIo(() =>
      runLogCommand(
        {
          ...base,
          today: "2026-05-20",
          field: "Followup",
          body: "Next day",
        },
        ["note"],
        cli,
        io,
      ),
    );
    const text = readFileSync(
      join(wikiRoot, "staff-engineer-2026-W21.md"),
      "utf-8",
    );
    assert.match(text, /^## 2026-05-19/m);
    assert.match(text, /^## 2026-05-20/m);
  });
});
