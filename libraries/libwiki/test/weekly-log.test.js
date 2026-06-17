import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockFs } from "@forwardimpact/libmock";
import {
  isoWeek,
  weeklyLogPath,
  appendEntry,
  bisectWeeklyLog,
  rebisectOverBudgetPart,
} from "../src/weekly-log.js";
import { countLines, countWords } from "../src/budget.js";
import {
  WEEKLY_LOG_LINE_BUDGET,
  WEEKLY_LOG_WORD_BUDGET,
} from "../src/constants.js";

const WIKI_ROOT = "/wiki";

// Build a `## YYYY-MM-DD` day-section of `lines` lines, each carrying
// `wordsPerLine` words, so a fixture can target the line- or word-budget
// independently.
function daySection(date, lines, wordsPerLine = 1) {
  const word = "word";
  const rows = [`## ${date}`];
  for (let i = 1; i < lines; i++) {
    rows.push(Array(wordsPerLine).fill(word).join(" "));
  }
  return rows.join("\n") + "\n";
}

function source(h1, ...sections) {
  return `${h1}\n${sections.join("")}`;
}

const H1 = "# Staff Engineer — 2026-W21";

describe("isoWeek", () => {
  test("2026-01-04 is W01", () => {
    const { year, week } = isoWeek(new Date("2026-01-04T00:00:00Z"));
    assert.equal(year, 2026);
    assert.equal(week, 1);
  });
  test("2026-05-19 is W21", () => {
    const { year, week } = isoWeek(new Date("2026-05-19T00:00:00Z"));
    assert.equal(year, 2026);
    assert.equal(week, 21);
  });
  test("2025-12-29 belongs to ISO 2026-W01 (year rolls forward)", () => {
    const { year, week } = isoWeek(new Date("2025-12-29T00:00:00Z"));
    assert.equal(year, 2026);
    assert.equal(week, 1);
  });
  test("2024-12-30 belongs to ISO 2025-W01 (year rolls forward)", () => {
    const { year, week } = isoWeek(new Date("2024-12-30T00:00:00Z"));
    assert.equal(year, 2025);
    assert.equal(week, 1);
  });
  test("2027-01-01 belongs to ISO 2026-W53 (year rolls back; 2026 has 53 ISO weeks)", () => {
    const { year, week } = isoWeek(new Date("2027-01-01T00:00:00Z"));
    assert.equal(year, 2026);
    assert.equal(week, 53);
  });
  test("2026-12-31 is 2026-W53", () => {
    const { year, week } = isoWeek(new Date("2026-12-31T00:00:00Z"));
    assert.equal(year, 2026);
    assert.equal(week, 53);
  });
});

describe("bisectWeeklyLog", () => {
  // Every part's rendered text (H1 + body) is at-or-under both budgets.
  const partConforms = (p) => {
    const rendered = `${p.h1}\n${p.body}`;
    return (
      countLines(rendered) <= WEEKLY_LOG_LINE_BUDGET &&
      countWords(rendered) <= WEEKLY_LOG_WORD_BUDGET
    );
  };
  const bodyBelowH1 = (text) => text.slice(text.indexOf("\n") + 1);

  test("over the line budget across days → ≥2 conforming parts", () => {
    // 4 × 150-line sections = 600 body lines > 496; each section < 496.
    const text = source(
      H1,
      daySection("2026-05-18", 150),
      daySection("2026-05-19", 150),
      daySection("2026-05-20", 150),
      daySection("2026-05-21", 150),
    );
    const { parts, residue } = bisectWeeklyLog(
      text,
      "staff-engineer",
      "2026-W21",
    );
    assert.equal(residue, null);
    assert.ok(parts.length >= 2, "splits into multiple parts");
    for (const p of parts) assert.ok(partConforms(p), "every part conforms");
  });

  test("over only the word budget across days → ≥2 conforming parts", () => {
    // 2 × 200-line sections @ 20 words/line ≈ 4000 words each > 6400 jointly,
    // ~400 lines total < 496 — only the word budget is breached.
    const text = source(
      H1,
      daySection("2026-05-19", 200, 20),
      daySection("2026-05-20", 200, 20),
    );
    assert.ok(countLines(text) <= WEEKLY_LOG_LINE_BUDGET, "under the line cap");
    assert.ok(countWords(text) > WEEKLY_LOG_WORD_BUDGET, "over the word cap");
    const { parts, residue } = bisectWeeklyLog(
      text,
      "staff-engineer",
      "2026-W21",
    );
    assert.equal(residue, null);
    assert.ok(parts.length >= 2);
    for (const p of parts) assert.ok(partConforms(p));
  });

  test("loses and duplicates no content; cuts only at day seams", () => {
    const text = source(
      H1,
      "preamble line\n",
      daySection("2026-05-18", 150),
      daySection("2026-05-19", 150),
      daySection("2026-05-20", 150),
      daySection("2026-05-21", 150),
    );
    const { parts } = bisectWeeklyLog(text, "staff-engineer", "2026-W21");
    // Concatenated part bodies equal the original body below its H1.
    assert.equal(parts.map((p) => p.body).join(""), bodyBelowH1(text));
    // The prologue rides with part 1; every other part starts at a day seam,
    // and no day-section's count is lost or duplicated across parts.
    assert.match(parts[0].body, /^preamble line\n## 2026-05-18/);
    for (const p of parts.slice(1)) {
      assert.match(p.body, /^## \d{4}-\d{2}-\d{2}/);
    }
    const seamCount = (s) => (s.match(/^## \d{4}-\d{2}-\d{2}/gm) || []).length;
    assert.equal(
      parts.reduce((n, p) => n + seamCount(p.body), 0),
      seamCount(bodyBelowH1(text)),
    );
  });

  test("H1s number (part 1 of M) … (part M of M)", () => {
    const text = source(
      H1,
      daySection("2026-05-18", 150),
      daySection("2026-05-19", 150),
      daySection("2026-05-20", 150),
      daySection("2026-05-21", 150),
    );
    const { parts } = bisectWeeklyLog(text, "staff-engineer", "2026-W21");
    const m = parts.length;
    parts.forEach((p, i) => {
      assert.equal(p.h1, `# Staff Engineer — 2026-W21 (part ${i + 1} of ${m})`);
    });
  });

  test("irreducible lone day-section → residue named with its date", () => {
    // One 600-line section alone exceeds the line budget; the rest packs.
    const text = source(
      H1,
      daySection("2026-05-18", 50),
      daySection("2026-05-19", 600),
      daySection("2026-05-20", 50),
    );
    const { parts, residue } = bisectWeeklyLog(
      text,
      "staff-engineer",
      "2026-W21",
    );
    assert.ok(residue, "an irreducible residue is reported");
    assert.equal(residue.section, "2026-05-19");
    assert.ok(residue.lines > WEEKLY_LOG_LINE_BUDGET);
    // The residue's part carries that section; the rest conforms.
    assert.match(parts[residue.partIndex].body, /^## 2026-05-19/);
    parts.forEach((p, i) => {
      if (i !== residue.partIndex) {
        const rendered = `${p.h1}\n${p.body}`;
        assert.ok(countLines(rendered) <= WEEKLY_LOG_LINE_BUDGET);
      }
    });
    // Content is still fully preserved.
    assert.equal(parts.map((p) => p.body).join(""), bodyBelowH1(text));
  });

  test("over-cap prologue above day-sections → residue 'prologue', never silent", () => {
    // A preamble that alone busts the line budget, then normal day-sections.
    const prologue = `${Array(600).fill("preamble").join("\n")}\n`;
    const text = source(
      H1,
      prologue,
      daySection("2026-05-19", 50),
      daySection("2026-05-20", 50),
    );
    const { parts, residue } = bisectWeeklyLog(
      text,
      "staff-engineer",
      "2026-W21",
    );
    assert.ok(
      residue,
      "the over-cap prologue is flagged, not shipped silently",
    );
    assert.equal(residue.section, "prologue");
    assert.equal(residue.partIndex, 0);
    assert.ok(residue.lines > WEEKLY_LOG_LINE_BUDGET);
    // The prologue is part 0; content is still fully preserved.
    assert.match(parts[0].body, /^preamble/);
    assert.equal(parts.map((p) => p.body).join(""), bodyBelowH1(text));
  });

  test("multiple irreducible sections → first named, every over-cap part present", () => {
    const text = source(
      H1,
      daySection("2026-05-18", 600),
      daySection("2026-05-19", 50),
      daySection("2026-05-20", 600),
    );
    const { parts, residue } = bisectWeeklyLog(
      text,
      "staff-engineer",
      "2026-W21",
    );
    // residue names the FIRST irreducible chunk (plan: "names the first such
    // chunk"); the second over-cap section is still its own part in the list,
    // so the caller's status is incomplete and the audit flags every over-cap
    // part — none ships silently.
    assert.equal(residue.section, "2026-05-18");
    const overCap = parts.filter(
      (p) => countLines(`${p.h1}\n${p.body}`) > WEEKLY_LOG_LINE_BUDGET,
    );
    assert.equal(overCap.length, 2, "both irreducible parts are present");
    assert.equal(parts.map((p) => p.body).join(""), bodyBelowH1(text));
  });

  test("zero-day-section over-cap source → residue 'prologue'", () => {
    const text = `${H1}\n${Array(600).fill("filler").join("\n")}\n`;
    const { parts, residue } = bisectWeeklyLog(
      text,
      "staff-engineer",
      "2026-W21",
    );
    assert.equal(parts.length, 1);
    assert.ok(residue);
    assert.equal(residue.section, "prologue");
    assert.equal(residue.partIndex, 0);
    assert.equal(parts.map((p) => p.body).join(""), bodyBelowH1(text));
  });

  // Build a `## YYYY-MM-DD` day-section whose body is `blockCount` `### ` blocks
  // of `linesPerBlock` lines each, so a single over-cap day is splittable at its
  // block seams (spec 1730 capability 2).
  function daySectionWithBlocks(date, blockCount, linesPerBlock) {
    const rows = [`## ${date}`];
    for (let b = 1; b <= blockCount; b++) {
      rows.push(`### Block ${b}`);
      for (let i = 1; i < linesPerBlock; i++) rows.push("word");
    }
    return rows.join("\n") + "\n";
  }

  test("lone over-cap day with multiple ### blocks → split at block seams (criteria 2, 4)", () => {
    // One day-section ~600 lines (over the 496 line cap) made of 4 blocks; no
    // single block exceeds the cap, so it splits cleanly with no residue.
    const text = source(
      H1,
      daySection("2026-05-18", 30),
      daySectionWithBlocks("2026-05-19", 4, 150),
      daySection("2026-05-20", 30),
    );
    const { parts, residue } = bisectWeeklyLog(
      text,
      "staff-engineer",
      "2026-W21",
    );
    assert.equal(residue, null, "no residue — every block fits a part");
    // Content-equal with the input (move-not-copy at the finer grain).
    assert.equal(parts.map((p) => p.body).join(""), bodyBelowH1(text));
    // No part exceeds a cap.
    for (const p of parts) {
      const rendered = `${p.h1}\n${p.body}`;
      assert.ok(countLines(rendered) <= WEEKLY_LOG_LINE_BUDGET);
      assert.ok(countWords(rendered) <= WEEKLY_LOG_WORD_BUDGET);
    }
    // The `## 2026-05-19` heading rides the first block-part of that day.
    assert.ok(parts.some((p) => p.body.includes("## 2026-05-19\n### Block 1")));
  });

  test("single ### block alone over cap → declared residue naming the block (criterion 3)", () => {
    // A day with one 600-line `### ` block that itself busts the cap: the day
    // splits, but that block remains an irreducible, declared residue.
    const big = daySectionWithBlocks("2026-05-19", 1, 600);
    const text = source(H1, daySection("2026-05-18", 30), big);
    const { parts, residue } = bisectWeeklyLog(
      text,
      "staff-engineer",
      "2026-W21",
    );
    assert.ok(residue, "the over-cap block is declared, not silently shipped");
    assert.equal(residue.section, "### Block 1");
    assert.ok(residue.lines > WEEKLY_LOG_LINE_BUDGET);
    assert.match(parts[residue.partIndex].body, /### Block 1/);
    assert.equal(parts.map((p) => p.body).join(""), bodyBelowH1(text));
  });
});

// The split branch of rebisectOverBudgetPart uses fs.renameSync (not modelled
// by the in-memory mock) and lives in weekly-log-part.integration.test.js. Only
// the branches that read but never seal are exercised here.
describe("rebisectOverBudgetPart — non-writing branches", () => {
  const PART = `${WIKI_ROOT}/staff-engineer-2026-W21-part1.md`;
  const PART_H1 = "# Staff Engineer — 2026-W21 (part 1 of 2)";

  test("noop when the part is within both budgets", () => {
    const text = source(PART_H1, daySection("2026-05-19", 10));
    const fs = createMockFs({ [PART]: text });
    const res = rebisectOverBudgetPart(PART, fs);
    assert.equal(res.status, "noop");
    assert.equal(fs.readFileSync(PART, "utf-8"), text, "left untouched");
  });

  test("noop and untouched when the filename is not a conforming part name", () => {
    // A main-log path (no -partN suffix), over budget — still a noop: the part
    // budgets do not own this file, the main-rotation pass does.
    const main = weeklyLogPath(WIKI_ROOT, "staff-engineer", "2026-05-19");
    const text = source(H1, daySection("2026-05-19", 600));
    const fs = createMockFs({ [main]: text });
    const res = rebisectOverBudgetPart(main, fs);
    assert.equal(res.status, "noop");
    assert.equal(fs.readFileSync(main, "utf-8"), text, "left untouched");
  });

  test("irreducible lone over-cap day-section → incomplete, byte-identical", () => {
    const text = source(PART_H1, daySection("2026-05-19", 600));
    const fs = createMockFs({ [PART]: text });
    const res = rebisectOverBudgetPart(PART, fs);
    assert.equal(res.status, "incomplete");
    assert.deepEqual(res.parts, [PART]);
    assert.equal(res.residue.section, "2026-05-19");
    assert.equal(res.residue.path, PART);
    assert.equal(fs.readFileSync(PART, "utf-8"), text, "no partial write");
  });

  test("zero-seam over-cap body → incomplete with section 'prologue', byte-identical", () => {
    const text = `${PART_H1}\n${Array(600).fill("prose").join("\n")}\n`;
    const fs = createMockFs({ [PART]: text });
    const res = rebisectOverBudgetPart(PART, fs);
    assert.equal(res.status, "incomplete");
    assert.equal(res.residue.section, "prologue");
    assert.equal(fs.readFileSync(PART, "utf-8"), text, "no partial write");
  });
});

describe("appendEntry", () => {
  test("creates the file with an H1 when missing", () => {
    const fs = createMockFs();
    const filePath = weeklyLogPath(WIKI_ROOT, "staff-engineer", "2026-05-19");
    appendEntry(
      filePath,
      "## 2026-05-19\n\n### Decision\nbody",
      "staff-engineer",
      "2026-05-19",
      fs,
    );
    const content = fs.readFileSync(filePath, "utf-8");
    assert.match(content, /^# Staff Engineer — 2026-W21/);
    assert.match(content, /## 2026-05-19/);
  });
});
