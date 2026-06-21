import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { GitClient } from "@forwardimpact/libutil/git-client";
import { WikiSync, WikiPushFailure } from "../src/wiki-sync.js";
import { git, createBareRepo, seedBareRepo, cloneRepo } from "./helpers.js";

function makeSync(wikiDir, parentDir, resolveToken = () => null) {
  const runtime = createDefaultRuntime();
  const gitClient = new GitClient({ runtime });
  return new WikiSync({ runtime, gitClient, wikiDir, parentDir, resolveToken });
}

// A summary-class file body of exactly `words` whitespace-delimited tokens,
// the H1 `# <Name> — Summary` included in the count. The audit's `countWords`
// counts the H1's tokens ("#", "<Name>", "—", "Summary"), so the filler is
// sized to hit the target precisely.
function summaryBody(name, words) {
  const h1 = `# ${name} — Summary`;
  const h1Words = h1.split(/\s+/).filter(Boolean).length;
  const filler = Array.from({ length: words - h1Words }, (_, i) => `w${i}`);
  return `${h1}\n\n${filler.join(" ")}\n`;
}

// A weekly-log-main body of `words` tokens with a matching H1.
function weeklyBody(name, words) {
  const h1 = `# ${name} — 2026-W25`;
  const h1Words = h1.split(/\s+/).filter(Boolean).length;
  const filler = Array.from({ length: words - h1Words }, (_, i) => `w${i}`);
  return `${h1}\n\n${filler.join(" ")}\n`;
}

describe("WikiSync budget re-validation gate (size axis)", () => {
  const SUMMARY = "staff-engineer.md";
  const WEEKLY = "staff-engineer-2026-W25.md";

  // Land `text` at `file` on origin from an independent clone, so the gate's
  // origin-tip baseline and a foreign writer's content are real remote state.
  function landAtOrigin(bare, file, text, message) {
    const { parent, wikiDir } = cloneRepo(bare, `origin-${Math.random()}`);
    git(wikiDir, "checkout", "master");
    writeFileSync(join(wikiDir, file), text);
    git(wikiDir, "add", "-A");
    git(wikiDir, "commit", "-m", message);
    git(wikiDir, "push", "origin", "master");
    return { parent, wikiDir };
  }

  test("criterion 1: two under-cap inputs union over cap → refused, commits local", async () => {
    // Both inputs are individually under cap; their non-conflicting union (each
    // side appends a distinct region) lands the rebased HEAD over cap. The gate
    // measures the post-rebase HEAD and refuses what neither author wrote alone.
    const bare = createBareRepo();
    // A base with a TOP slot and a BOTTOM slot separated by stable context, so
    // an edit to each slot 3-way-merges without conflict. Each side's edit
    // stays under cap; their union exceeds the 2048 word cap.
    const context = Array.from({ length: 40 }, (_, i) => `ctx${i}`).join("\n");
    const baseBody = `# Staff — Summary\n\nTOP_SLOT\n\n${context}\n\nBOTTOM_SLOT\n`;
    seedBareRepo(bare, { files: { [SUMMARY]: baseBody } });
    const { parent, wikiDir } = cloneRepo(bare, "c1");
    git(wikiDir, "checkout", "master");
    // Origin advances: a foreign lane fills the TOP slot with ~1000 words.
    const originSide = Array.from({ length: 1100 }, (_, i) => `o${i}`).join(
      " ",
    );
    landAtOrigin(
      bare,
      SUMMARY,
      baseBody.replace("TOP_SLOT", originSide),
      "origin advance",
    );
    // The writer fills the BOTTOM slot with ~1000 words (a distinct region), so
    // the rebase merges cleanly and the union exceeds the word cap.
    const writerSide = Array.from({ length: 1100 }, (_, i) => `m${i}`).join(
      " ",
    );
    writeFileSync(
      join(wikiDir, SUMMARY),
      baseBody.replace("BOTTOM_SLOT", writerSide),
    );
    const headBefore = git(wikiDir, "rev-parse", "HEAD");
    await assert.rejects(
      () => makeSync(wikiDir, parent).commitAndPush("wiki: append", [SUMMARY]),
      (err) => err instanceof WikiPushFailure && err.reason === "budget",
    );
    // Commits are kept local: the writer's commit exists, the push did not land.
    assert.notEqual(git(wikiDir, "rev-parse", "HEAD"), headBefore);
  });

  test("criterion 2: no-merge session-close rewrite over cap → refused", async () => {
    const bare = createBareRepo();
    seedBareRepo(bare, { files: { [SUMMARY]: summaryBody("Staff", 1998) } });
    const { parent, wikiDir } = cloneRepo(bare, "c2");
    git(wikiDir, "checkout", "master");
    // Author-overrun: a single-lane rewrite over cap, no foreign advance.
    writeFileSync(join(wikiDir, SUMMARY), summaryBody("Staff", 2100));
    await assert.rejects(
      () => makeSync(wikiDir, parent).commitAndPush("wiki: rewrite", [SUMMARY]),
      (err) => err instanceof WikiPushFailure && err.reason === "budget",
    );
  });

  test("criterion 3: deepening an existing breach → refused", async () => {
    const bare = createBareRepo();
    // Origin already over cap; the writer adds more words to that same file.
    seedBareRepo(bare, { files: { [SUMMARY]: summaryBody("Staff", 2060) } });
    const { parent, wikiDir } = cloneRepo(bare, "c3");
    git(wikiDir, "checkout", "master");
    writeFileSync(join(wikiDir, SUMMARY), summaryBody("Staff", 2120));
    await assert.rejects(
      () => makeSync(wikiDir, parent).commitAndPush("wiki: deepen", [SUMMARY]),
      (err) => err instanceof WikiPushFailure && err.reason === "budget",
    );
  });

  test("criterion 4: foreign pre-existing breach the writer did not worsen → pushed", async () => {
    const bare = createBareRepo();
    // Origin carries an over-cap summary the writer never touches; the writer
    // lands an unrelated under-cap file. The breach must not block the push.
    seedBareRepo(bare, { files: { [SUMMARY]: summaryBody("Staff", 2200) } });
    const { parent, wikiDir } = cloneRepo(bare, "c4");
    git(wikiDir, "checkout", "master");
    writeFileSync(join(wikiDir, "notes.md"), "# unrelated\n");
    const result = await makeSync(wikiDir, parent).commitAndPush(
      "wiki: unrelated",
      ["notes.md"],
    );
    assert.equal(result.landed, true);
    assert.equal(result.reason, "landed");
  });

  test("criterion 5: owner trim leaves breached file ≤ baseline → pushed", async () => {
    const bare = createBareRepo();
    // Origin over cap; the writer trims the same file back under cap (improves).
    seedBareRepo(bare, { files: { [SUMMARY]: summaryBody("Staff", 2200) } });
    const { parent, wikiDir } = cloneRepo(bare, "c5");
    git(wikiDir, "checkout", "master");
    writeFileSync(join(wikiDir, SUMMARY), summaryBody("Staff", 1500));
    const result = await makeSync(wikiDir, parent).commitAndPush("wiki: trim", [
      SUMMARY,
    ]);
    assert.equal(result.landed, true);
    assert.equal(result.reason, "landed");
  });

  test("criterion 6: weekly-log budget regression refused under the same delta", async () => {
    const bare = createBareRepo();
    seedBareRepo(bare, { files: { [WEEKLY]: weeklyBody("Staff", 100) } });
    const { parent, wikiDir } = cloneRepo(bare, "c6");
    git(wikiDir, "checkout", "master");
    // Push the weekly log past its line budget (496) with a no-merge rewrite.
    const lines = Array.from({ length: 600 }, (_, i) => `line ${i}`);
    const body = `# Staff — 2026-W25\n\n${lines.join("\n")}\n`;
    writeFileSync(join(wikiDir, WEEKLY), body);
    await assert.rejects(
      () => makeSync(wikiDir, parent).commitAndPush("wiki: weekly", [WEEKLY]),
      (err) => err instanceof WikiPushFailure && err.reason === "budget",
    );
  });

  test("criterion 7: refusal names file, baseline, outgoing, ruleId, reason class", async () => {
    const bare = createBareRepo();
    seedBareRepo(bare, { files: { [SUMMARY]: summaryBody("Staff", 1998) } });
    const { parent, wikiDir } = cloneRepo(bare, "c7");
    git(wikiDir, "checkout", "master");
    writeFileSync(join(wikiDir, SUMMARY), summaryBody("Staff", 2100));
    let caught;
    try {
      await makeSync(wikiDir, parent).commitAndPush("wiki: rewrite", [SUMMARY]);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof WikiPushFailure);
    assert.equal(caught.reason, "budget");
    const entry = caught.refusals.find((r) => r.file === SUMMARY);
    assert.ok(entry, "refusal names the offending file");
    assert.equal(entry.ruleId, "summary.word-budget");
    assert.ok(entry.value > entry.baseline, "outgoing exceeds baseline");
    assert.equal(entry.baseline, 1998);
  });

  test("criterion 9: memo delivery into deficient headroom is surfaced, not refused", async () => {
    const bare = createBareRepo();
    seedBareRepo(bare, { files: { [SUMMARY]: summaryBody("Staff", 1998) } });
    const { parent, wikiDir } = cloneRepo(bare, "c9");
    git(wikiDir, "checkout", "master");
    // A delivery takes the summary over cap; the caller exempts that file.
    writeFileSync(join(wikiDir, SUMMARY), summaryBody("Staff", 2100));
    const result = await makeSync(wikiDir, parent).commitAndPush(
      "wiki: deliver memo",
      [SUMMARY],
      { exemptSummaryFiles: [SUMMARY] },
    );
    assert.equal(result.landed, true);
    assert.equal(result.reason, "landed");
    assert.ok(
      result.surfaced.some(
        (s) => s.file === SUMMARY && s.ruleId === "summary.word-budget",
      ),
      "the breach is surfaced on the landed result",
    );
  });

  test("criterion 10: clean under-budget sync behaves exactly as today", async () => {
    const bare = createBareRepo();
    seedBareRepo(bare, { files: { [SUMMARY]: summaryBody("Staff", 1500) } });
    const { parent, wikiDir } = cloneRepo(bare, "c10");
    git(wikiDir, "checkout", "master");
    writeFileSync(join(wikiDir, SUMMARY), summaryBody("Staff", 1600));
    const result = await makeSync(wikiDir, parent).commitAndPush("wiki: tidy", [
      SUMMARY,
    ]);
    assert.equal(result.landed, true);
    assert.equal(result.reason, "landed");
    // No surfaced breach on a clean sync — the field is absent, so the landed
    // result is byte-identical to today's happy path.
    assert.equal(result.surfaced, undefined);
  });

  test("autostash residue is excluded — the gate measures the committed HEAD, not the working dir", async () => {
    const bare = createBareRepo();
    seedBareRepo(bare, { files: { [SUMMARY]: summaryBody("Staff", 1500) } });
    const { parent, wikiDir } = cloneRepo(bare, "dirt");
    git(wikiDir, "checkout", "master");
    // The writer commits an under-cap edit to its own file...
    writeFileSync(join(wikiDir, SUMMARY), summaryBody("Staff", 1600));
    // ...while foreign uncommitted over-cap dirt sits on an undeclared path.
    writeFileSync(
      join(wikiDir, "improvement-coach.md"),
      summaryBody("Coach", 2200),
    );
    const result = await makeSync(wikiDir, parent).commitAndPush(
      "wiki: own edit",
      [SUMMARY],
    );
    // The push lands: the over-cap dirt is uncommitted, never on HEAD.
    assert.equal(result.landed, true);
    assert.equal(result.reason, "landed");
  });
});
