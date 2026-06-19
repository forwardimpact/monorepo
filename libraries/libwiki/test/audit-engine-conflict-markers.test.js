import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import { runRules } from "@forwardimpact/libutil";
import { RULES } from "../src/audit/rules.js";
import { buildContext, resolveScope } from "../src/audit/scopes.js";

const WIKI = "/wiki";
const STORYBOARD_AGENTS = [
  "product-manager",
  "release-engineer",
  "security-engineer",
  "staff-engineer",
  "technical-writer",
];

const MEMORY_NONE = [
  "## Cross-Cutting Priorities",
  "",
  "| Item | Agents | Owner | Status | Added |",
  "| --- | --- | --- | --- | --- |",
  "| *None* | — | — | — | — |",
  "",
].join("\n");

function storyboard(yyyy, mm) {
  return [
    `# Storyboard — ${yyyy}-${mm}`,
    "",
    ...STORYBOARD_AGENTS.map((a) => `### ${a} — backlog\n- item`),
    "",
  ].join("\n");
}

// The clean-wiki seed (MEMORY.md + the current-month storyboard for `today`),
// overlaid with `extra`. buildContext reads these via runtime.fsSync.
function cleanSeed(today = "2026-05-24", extra = {}) {
  const d = new Date(today);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return {
    [`${WIKI}/MEMORY.md`]: MEMORY_NONE,
    [`${WIKI}/storyboard-${yyyy}-M${mm}.md`]: storyboard(yyyy, mm),
    ...extra,
  };
}

function audit(seed, today = "2026-05-24") {
  const ctx = buildContext({
    wikiRoot: WIKI,
    today,
    fs: createMockFs(seed),
  });
  return runRules(RULES, ctx, { resolveScope });
}

const idsOf = (findings) => findings.map((f) => f.id);

// -- conflict.markers audit rule: structural conflict-block detection --

describe("runRules — conflict.markers", () => {
  const OPEN = "<<<<<<< HEAD";
  const SEP = "=======";
  const CLOSE = ">>>>>>> origin/master";

  function summaryWith(...body) {
    return [
      "# Staff Engineer — Summary",
      "",
      "**Last run**: nothing.",
      "",
      "## Message Inbox",
      "",
      "<!-- memo:inbox -->",
      "",
      ...body,
      "",
    ].join("\n");
  }

  const conflictFindings = (findings) =>
    findings.filter((f) => f.id === "conflict.markers");

  test("C1: fires on a branch-merge conflict block in a summary", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryWith(OPEN, "ours", SEP, "x", CLOSE),
    });
    const hits = conflictFindings(audit(seed));
    assert.ok(hits.length >= 1);
    assert.equal(hits[0].level, "fail");
  });

  test("C1: fires on the stash-pop label forms", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryWith(
        "<<<<<<< Updated upstream",
        "a",
        SEP,
        "b",
        ">>>>>>> Stashed changes",
      ),
    });
    assert.ok(conflictFindings(audit(seed)).length >= 1);
  });

  test("C1: split block across two sealed parts fires on EACH file", () => {
    // Reproduces wiki repair 7c281c59: seal rotation severs one block — the
    // open marker only in part 27, the separator + close only in part 28. A
    // complete-in-file-block matcher would miss both.
    const part27 = [
      "# Staff Engineer — 2026-W21 (part 27 of 28)",
      "",
      "tail of an entry",
      OPEN,
      "ours-content",
    ].join("\n");
    const part28 = [
      "# Staff Engineer — 2026-W21 (part 28 of 28)",
      "",
      "theirs-content",
      SEP,
      CLOSE,
    ].join("\n");
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer-2026-W21-part27.md`]: part27,
      [`${WIKI}/staff-engineer-2026-W21-part28.md`]: part28,
    });
    const hits = conflictFindings(audit(seed));
    const byPath = (suffix) =>
      hits.filter((f) => f.path.endsWith(suffix)).map((f) => f.message);
    const p27 = byPath("part27.md");
    const p28 = byPath("part28.md");
    assert.equal(p27.length, 1, "part 27 fires once (open)");
    assert.match(p27[0], /\(open\)/);
    assert.equal(p28.length, 1, "part 28 fires once (close)");
    assert.match(p28[0], /\(close\)/);
  });

  test("C2: does not fire on the quoted-rider shape (fenced + spans)", () => {
    // The W24 rider quotes both label forms in backtick code spans inside a
    // fenced block, including a column-1 wrapped close and an in-span
    // separator. Anchored by content shape, not filename.
    const rider = summaryWith(
      "The corruption deposited markers documented below:",
      "",
      "```text",
      "<<<<<<< Updated upstream",
      "=======",
      ">>>>>>> 7c281c59",
      "```",
      "",
      "Inline: a `>>>>>>> sha` and `<<<<<<< HEAD` and an in-span `=======`.",
    );
    assert.deepEqual(
      conflictFindings(
        audit({
          [`${WIKI}/MEMORY.md`]: MEMORY_NONE,
          [`${WIKI}/storyboard-2026-M05.md`]: storyboard("2026", "05"),
          [`${WIKI}/staff-engineer.md`]: rider,
        }),
      ),
      [],
    );
  });

  test("C2: does not fire on straight-quote mid-line prose markers", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryWith(
        'The marker "<<<<<<< HEAD" appeared mid-sentence, then "=======".',
      ),
    });
    assert.deepEqual(conflictFindings(audit(seed)), []);
  });

  test("C3: does not fire on a setext-heading underline", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryWith("A Heading", SEP, "body"),
    });
    assert.deepEqual(conflictFindings(audit(seed)), []);
  });

  test("C4: fires inside STATUS.md's fenced row table (data, not prose)", () => {
    const status = [
      "# Spec Status",
      "",
      "## Rows",
      "",
      "```",
      "0010\tplan\timplemented",
      OPEN,
      "0020\tplan\tapproved",
      SEP,
      "0020\tplan\tdraft",
      CLOSE,
      "```",
      "",
    ].join("\n");
    const seed = cleanSeed("2026-05-24", { [`${WIKI}/STATUS.md`]: status });
    const hits = conflictFindings(audit(seed));
    assert.ok(
      hits.some((f) => f.path.endsWith("STATUS.md")),
      "STATUS.md fence must not exempt conflict markers",
    );
  });

  test("C5: hint adjudicates the merged form and carries no trim guidance", () => {
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer.md`]: summaryWith(OPEN, SEP, CLOSE),
    });
    const finding = conflictFindings(audit(seed))[0];
    assert.match(finding.hint, /adjudicate/);
    assert.doesNotMatch(finding.hint, /trim/);
  });

  test("C6: marker finding co-occurs with the word-budget finding", () => {
    // #1668 event 2 peaked at 2158/2048 words while carrying a marker block;
    // the size breach alone misattributed the defect. Both must now fire.
    const filler = Array(7000).fill("word").join(" ");
    const log = [
      "# Staff Engineer — 2026-W21",
      "",
      "## 2026-05-20",
      "",
      "### Decision",
      "",
      filler,
      "",
      OPEN,
      "ours",
      SEP,
      "theirs",
      CLOSE,
      "",
    ].join("\n");
    const seed = cleanSeed("2026-05-24", {
      [`${WIKI}/staff-engineer-2026-W21.md`]: log,
    });
    const ids = idsOf(audit(seed));
    assert.ok(ids.includes("weekly-log.word-budget"));
    assert.ok(ids.includes("conflict.markers"));
  });
});
