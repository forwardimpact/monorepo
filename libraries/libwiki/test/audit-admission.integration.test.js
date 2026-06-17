import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAuditCommand } from "../src/commands/audit.js";
import { git, makeRuntime, ctxFor, seedCleanWiki } from "./helpers.js";

// Exercise the `admission` scope against a REAL git repo so the `git ls-files`
// intersection is genuinely tested: only tracked files are in the universe.
describe("admission scope (real git)", () => {
  let wikiDir;

  beforeEach(() => {
    wikiDir = mkdtempSync(join(tmpdir(), "wiki-admission-"));
    git(wikiDir, "init");
    git(wikiDir, "config", "user.name", "Test");
    git(wikiDir, "config", "user.email", "test@example.com");
    git(wikiDir, "config", "commit.gpgsign", "false");
    seedCleanWiki(wikiDir); // MEMORY.md + storyboard-2026-M05.md
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "seed");
  });

  function audit() {
    const harness = makeRuntime();
    const result = runAuditCommand(
      ctxFor({
        runtime: harness.runtime,
        options: {
          "wiki-root": wikiDir,
          today: "2026-05-24",
          format: "json",
        },
      }),
    );
    return { result, parsed: JSON.parse(harness.stdout) };
  }

  const admissionFindings = (parsed) =>
    [...parsed.failures, ...parsed.warnings].filter(
      (f) => f.id === "admission.not-in-grammar",
    );

  test("clean tracked wiki fires zero admission findings", () => {
    assert.deepEqual(admissionFindings(audit().parsed), []);
  });

  test("an untracked rogue is invisible (universe is the git index)", () => {
    // Written but never `git add`ed — outside the tracked universe.
    writeFileSync(
      join(wikiDir, "product-manager-2026-W24-history.md"),
      "# rogue\n",
    );
    assert.deepEqual(admissionFindings(audit().parsed), []);
  });

  test("the rogue is flagged once it is tracked", () => {
    writeFileSync(
      join(wikiDir, "product-manager-2026-W24-history.md"),
      "# rogue\n",
    );
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "track rogue");
    const { result, parsed } = audit();
    const flagged = admissionFindings(parsed);
    assert.equal(flagged.length, 1);
    assert.match(flagged[0].path ?? flagged[0].message ?? "", /history\.md/);
    assert.equal(result.ok, false);
  });

  test("the .git directory itself is never part of the universe", () => {
    // No admission finding for any .git/* path even though it is on disk.
    const flagged = admissionFindings(audit().parsed).map(
      (f) => f.path ?? f.message,
    );
    assert.ok(!flagged.some((m) => m.includes(".git/")));
  });

  test("tracked sidecar and metrics files are admitted", () => {
    mkdirSync(join(wikiDir, "metrics", "kata-design"), { recursive: true });
    writeFileSync(join(wikiDir, "metrics", "kata-design", "2026.csv"), "ts\n");
    // staff-engineer.md is a root summary so staff-engineer/ is an admitted sidecar.
    writeFileSync(
      join(wikiDir, "staff-engineer.md"),
      "# Staff Engineer — Summary\n",
    );
    mkdirSync(join(wikiDir, "staff-engineer"), { recursive: true });
    writeFileSync(join(wikiDir, "staff-engineer", "exp.csv"), "ts\n");
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", "sidecars");
    assert.deepEqual(admissionFindings(audit().parsed), []);
  });
});
