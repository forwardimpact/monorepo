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
import { execFileSync } from "node:child_process";

const CLI_PATH = new URL("../bin/fit-wiki.js", import.meta.url).pathname;

describe("fit-wiki log CLI", () => {
  let dir;
  let wikiRoot;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "log-cli-"));
    wikiRoot = join(dir, "wiki");
    mkdirSync(wikiRoot, { recursive: true });
    writeFileSync(join(dir, "package.json"), '{"name":"root"}');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("log decision writes leading ### Decision block", () => {
    execFileSync(
      "node",
      [
        CLI_PATH,
        "log",
        "decision",
        "--agent",
        "staff-engineer",
        "--surveyed",
        "owned",
        "--chosen",
        "implement spec NNNN",
        "--rationale",
        "merged plan",
        "--today",
        "2026-05-19",
      ],
      { cwd: dir, encoding: "utf-8" },
    );
    const expected = join(wikiRoot, "staff-engineer-2026-W21.md");
    assert.equal(existsSync(expected), true);
    const text = readFileSync(expected, "utf-8");
    assert.match(text, /## 2026-05-19/);
    assert.match(text, /### Decision/);
    assert.match(text, /\*\*Surveyed:\*\* owned/);
    assert.match(text, /\*\*Chosen:\*\* implement spec NNNN/);
  });

  test("missing subcommand exits 2", () => {
    try {
      execFileSync("node", [CLI_PATH, "log", "--agent", "staff-engineer"], {
        cwd: dir,
        encoding: "utf-8",
        stdio: "pipe",
      });
      assert.fail("expected exit 2");
    } catch (err) {
      assert.equal(err.status, 2);
    }
  });

  test("log note appends under the open decision's date heading", () => {
    const args = (sub, extra) => [
      CLI_PATH,
      "log",
      sub,
      "--agent",
      "staff-engineer",
      "--today",
      "2026-05-19",
      ...extra,
    ];
    execFileSync(
      "node",
      args("decision", [
        "--surveyed",
        "owned",
        "--chosen",
        "x",
        "--rationale",
        "y",
      ]),
      { cwd: dir, encoding: "utf-8" },
    );
    execFileSync(
      "node",
      args("note", ["--field", "Actions taken", "--body", "Did stuff"]),
      { cwd: dir, encoding: "utf-8" },
    );
    execFileSync(
      "node",
      args("note", ["--field", "Findings", "--body", "All clean"]),
      { cwd: dir, encoding: "utf-8" },
    );
    execFileSync("node", args("done", []), { cwd: dir, encoding: "utf-8" });

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

  test("log note for a new day opens its own entry", () => {
    const base = ["--agent", "staff-engineer", "--wiki-root", wikiRoot];
    execFileSync(
      "node",
      [
        CLI_PATH,
        "log",
        "decision",
        ...base,
        "--today",
        "2026-05-19",
        "--surveyed",
        "s",
        "--chosen",
        "c",
        "--rationale",
        "r",
      ],
      { cwd: dir, encoding: "utf-8" },
    );
    execFileSync(
      "node",
      [
        CLI_PATH,
        "log",
        "note",
        ...base,
        "--today",
        "2026-05-20",
        "--field",
        "Followup",
        "--body",
        "Next day",
      ],
      { cwd: dir, encoding: "utf-8" },
    );
    const text = readFileSync(
      join(wikiRoot, "staff-engineer-2026-W21.md"),
      "utf-8",
    );
    assert.match(text, /^## 2026-05-19/m);
    assert.match(text, /^## 2026-05-20/m);
  });
});
