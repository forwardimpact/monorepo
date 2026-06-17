import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as nodeFs from "node:fs";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  statSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  rebisectOverBudgetPart,
  rotateIfOverBudget,
} from "../src/weekly-log.js";
import { WEEKLY_LOG_LINE_BUDGET } from "../src/constants.js";

// rebisectOverBudgetPart's split branch seals via fs.renameSync, which the
// in-memory libmock fs does not model. The non-writing branches (noop,
// irreducible, malformed name) are unit-tested in weekly-log.test.js; the
// renameSync-bearing split and rollback paths live here against the real fs.
describe("rebisectOverBudgetPart (part re-bisect)", () => {
  let wikiRoot;
  beforeEach(() => {
    wikiRoot = mkdtempSync(join(tmpdir(), "weekly-log-part-"));
  });
  afterEach(() => rmSync(wikiRoot, { recursive: true, force: true }));

  const SOURCE = "staff-engineer-2026-W21-part1.md";
  const PART_H1 = "# Staff Engineer — 2026-W21 (part 1 of 1)";

  // A multi-day part over the line budget: each section is under the cap but
  // jointly they overflow, so a re-bisect yields ≥2 conforming sub-parts.
  function multiDayPart(sections = 4, linesPerSection = 150, h1 = PART_H1) {
    let text = `${h1}\n`;
    for (let s = 0; s < sections; s++) {
      text += `## 2026-05-${String(18 + s).padStart(2, "0")}\n`;
      for (let i = 1; i < linesPerSection; i++) text += "filler\n";
    }
    return text;
  }

  const bodyOf = (t) => t.slice(t.indexOf("\n") + 1);
  const flakyRename = (failOn) => {
    let renames = 0;
    return {
      existsSync: nodeFs.existsSync,
      readFileSync: nodeFs.readFileSync,
      writeFileSync: nodeFs.writeFileSync,
      unlinkSync: nodeFs.unlinkSync,
      renameSync: (from, to) => {
        renames++;
        if (renames === failOn) throw new Error("disk full");
        return nodeFs.renameSync(from, to);
      },
    };
  };
  const leftoversBesidesSource = () =>
    readdirSync(wikiRoot).filter(
      (f) => (f.includes("-part") && f !== SOURCE) || f.endsWith(".tmp"),
    );

  test("splits a multi-day over-cap part into ≥2 conforming sub-parts, reusing the source slot", () => {
    const partPath = join(wikiRoot, SOURCE);
    const original = multiDayPart();
    writeFileSync(partPath, original);

    const r = rebisectOverBudgetPart(partPath, nodeFs);

    assert.equal(r.status, "resealed");
    assert.ok(r.parts.length >= 2, "splits into ≥2 sub-parts");
    assert.equal(r.parts[0], partPath, "first sub-part reuses the source slot");
    for (const p of r.parts) {
      assert.ok(
        readFileSync(p, "utf-8").split("\n").length - 1 <=
          WEEKLY_LOG_LINE_BUDGET,
        "each sub-part is at-or-under the line budget",
      );
    }
    // Concatenated sub-part bodies reproduce the original body byte-for-byte.
    const rejoined = r.parts
      .map((p) => bodyOf(readFileSync(p, "utf-8")))
      .join("");
    assert.equal(rejoined, bodyOf(original), "content preserved byte-for-byte");
  });

  test("appends overflow to the next free main-log slots, skipping occupied siblings", () => {
    // Source is part2; part1 and part4 already exist. Overflow must claim the
    // next free slot (part3), never clobbering the occupied part4.
    writeFileSync(join(wikiRoot, "staff-engineer-2026-W21-part1.md"), "# p1\n");
    const part4 = join(wikiRoot, "staff-engineer-2026-W21-part4.md");
    writeFileSync(part4, "# preexisting part 4\n");
    const partPath = join(wikiRoot, "staff-engineer-2026-W21-part2.md");
    writeFileSync(partPath, multiDayPart());

    const r = rebisectOverBudgetPart(partPath, nodeFs);

    assert.equal(r.status, "resealed");
    assert.equal(r.parts[0], partPath, "source slot part2 is reused");
    assert.match(
      r.parts[1],
      /-part3\.md$/,
      "overflow claims the next free slot",
    );
    assert.ok(!r.parts.includes(part4), "occupied part4 is not claimed");
    assert.equal(
      readFileSync(part4, "utf-8"),
      "# preexisting part 4\n",
      "the pre-existing part4 is untouched",
    );
  });

  test("re-bisects a word-only-over part into conforming sub-parts", () => {
    const partPath = join(wikiRoot, SOURCE);
    // 2 day-sections @ 200 lines × 20 words ≈ 8000 words > 6400, ~400 lines
    // < 496 — only the word budget is breached.
    let text = `${PART_H1}\n`;
    for (let s = 0; s < 2; s++) {
      text += `## 2026-05-${String(19 + s).padStart(2, "0")}\n`;
      for (let i = 1; i < 200; i++)
        text += `${Array(20).fill("word").join(" ")}\n`;
    }
    writeFileSync(partPath, text);

    const r = rebisectOverBudgetPart(partPath, nodeFs);
    assert.equal(r.status, "resealed");
    assert.ok(r.parts.length >= 2, "word overflow splits into ≥2 sub-parts");
  });

  test("incomplete: a reducible part holding one irreducible section still splits and flags", () => {
    const partPath = join(wikiRoot, SOURCE);
    let text = `${PART_H1}\n## 2026-05-18\nx\n## 2026-05-19\n`;
    for (let i = 0; i < 600; i++) text += "filler\n";
    text += "## 2026-05-20\ny\n";
    writeFileSync(partPath, text);

    const r = rebisectOverBudgetPart(partPath, nodeFs);
    assert.equal(r.status, "incomplete");
    assert.equal(r.residue.section, "2026-05-19");
    assert.ok(
      r.parts.includes(r.residue.path),
      "residue path is among the parts",
    );
    assert.ok(r.parts.length >= 2, "the reducible sections still split out");
    // Even when a residue survives, no content is dropped: the sub-part bodies
    // (source slot included) concatenate back to the original body.
    const rejoined = r.parts
      .map((p) => bodyOf(readFileSync(p, "utf-8")))
      .join("");
    assert.equal(rejoined, bodyOf(text), "content preserved byte-for-byte");
  });

  test("derives agent and week from the filename, naming new slots and H1s for that week", () => {
    const partPath = join(wikiRoot, "staff-engineer-2026-W10-part1.md");
    let text = "# Staff Engineer — 2026-W10 (part 1 of 1)\n";
    for (let s = 0; s < 4; s++) {
      text += `## 2026-03-0${s + 1}\n`;
      for (let i = 1; i < 150; i++) text += "filler\n";
    }
    writeFileSync(partPath, text);

    const r = rebisectOverBudgetPart(partPath, nodeFs);
    assert.equal(r.status, "resealed");
    assert.equal(r.parts[0], partPath, "the past-week source slot is reused");
    assert.match(r.parts[1], /staff-engineer-2026-W10-part2\.md$/);
    // The H1 carries the part's own (past) week and numbers the slot it
    // occupies — (part 2) on part2.md, no stale "of M" total (spec 1770).
    assert.match(
      readFileSync(r.parts[1], "utf-8"),
      /^# Staff Engineer — 2026-W10 \(part 2\)/,
      "produced H1 numbers its own slot and carries the part's week",
    );
    assert.doesNotMatch(
      readFileSync(r.parts[1], "utf-8"),
      /\(part \d+ of \d+\)/,
    );
    // The reused source slot keeps part 1.
    assert.match(
      readFileSync(r.parts[0], "utf-8"),
      /^# Staff Engineer — 2026-W10 \(part 1\)/,
    );
  });

  test("atomic: a failure committing a later new slot unwinds committed slots, source intact", () => {
    const partPath = join(wikiRoot, SOURCE);
    const original = multiDayPart(7); // 3 sub-parts → 2 new slots
    writeFileSync(partPath, original);
    const inodeBefore = statSync(partPath).ino;

    // Throw on the 2nd renameSync: ≥1 new slot already committed.
    assert.throws(
      () => rebisectOverBudgetPart(partPath, flakyRename(2)),
      /disk full/,
    );
    assert.equal(
      readFileSync(partPath, "utf-8"),
      original,
      "source contents intact",
    );
    assert.equal(statSync(partPath).ino, inodeBefore, "source inode unchanged");
    assert.deepEqual(
      leftoversBesidesSource(),
      [],
      "no new part or temp files survive the rollback",
    );
  });

  test("atomic: a failure on the final source rename leaves the source intact and unwinds new slots", () => {
    const partPath = join(wikiRoot, SOURCE);
    const original = multiDayPart(4); // 2 sub-parts → 1 new slot, then source
    writeFileSync(partPath, original);
    const inodeBefore = statSync(partPath).ino;

    // 1st rename commits the new slot; the 2nd (final) source rename fails.
    assert.throws(
      () => rebisectOverBudgetPart(partPath, flakyRename(2)),
      /disk full/,
    );
    assert.equal(readFileSync(partPath, "utf-8"), original, "source intact");
    assert.equal(statSync(partPath).ino, inodeBefore, "source inode unchanged");
    assert.deepEqual(
      leftoversBesidesSource(),
      [],
      "committed new slot unwound",
    );
  });

  test("atomic: a staging-phase write failure (before any rename) rolls back all temps", () => {
    const partPath = join(wikiRoot, SOURCE);
    const original = multiDayPart(4);
    writeFileSync(partPath, original);
    const inodeBefore = statSync(partPath).ino;

    let writes = 0;
    const flakyFs = {
      existsSync: nodeFs.existsSync,
      readFileSync: nodeFs.readFileSync,
      renameSync: nodeFs.renameSync,
      unlinkSync: nodeFs.unlinkSync,
      writeFileSync: (p, data) => {
        writes++;
        if (writes === 2) throw new Error("disk full");
        return nodeFs.writeFileSync(p, data);
      },
    };

    assert.throws(() => rebisectOverBudgetPart(partPath, flakyFs), /disk full/);
    assert.equal(readFileSync(partPath, "utf-8"), original, "source intact");
    assert.equal(statSync(partPath).ino, inodeBefore, "source inode unchanged");
    assert.deepEqual(leftoversBesidesSource(), [], "no staged temps survive");
  });
});

// Seal-path H1 numbering: every produced part's H1 equals the slot it occupies
// (spec 1770), on both the rotation path and beside pre-occupied siblings.
describe("rotateIfOverBudget — H1 numbers the filename slot (1770)", () => {
  let wikiRoot;
  beforeEach(() => {
    wikiRoot = mkdtempSync(join(tmpdir(), "weekly-log-rotate-"));
  });
  afterEach(() => rmSync(wikiRoot, { recursive: true, force: true }));

  const H1 = (n) =>
    n === undefined
      ? "# Staff Engineer — 2026-W21"
      : `# Staff Engineer — 2026-W21 (part ${n})`;
  const mainPath = () => join(wikiRoot, "staff-engineer-2026-W21.md");
  const slot = (n) => join(wikiRoot, `staff-engineer-2026-W21-part${n}.md`);
  const multiDay = (sections, lines = 150) => {
    let t = `${H1()}\n`;
    for (let s = 0; s < sections; s++) {
      t += `## 2026-05-${String(18 + s).padStart(2, "0")}\n`;
      for (let i = 1; i < lines; i++) t += "filler\n";
    }
    return t;
  };

  test("first rotation: each produced part opens with its slot number, no of-M", () => {
    writeFileSync(mainPath(), multiDay(4));
    const r = rotateIfOverBudget(
      wikiRoot,
      "staff-engineer",
      "2026-05-24",
      0,
      { force: true },
      nodeFs,
    );
    assert.equal(r.status, "sealed");
    assert.ok(r.parts.length >= 2);
    r.parts.forEach((p) => {
      const n = Number(p.match(/-part(\d+)\.md$/)[1]);
      assert.ok(
        readFileSync(p, "utf-8").startsWith(`${H1(n)}\n`),
        `slot ${n} H1`,
      );
      assert.doesNotMatch(readFileSync(p, "utf-8"), /\(part \d+ of \d+\)/);
    });
  });

  test("rotation beside occupied slots 1–4 continues the sequence in the headers", () => {
    for (let n = 1; n <= 4; n++) writeFileSync(slot(n), `${H1(n)}\nold\n`);
    writeFileSync(mainPath(), multiDay(4));
    const r = rotateIfOverBudget(
      wikiRoot,
      "staff-engineer",
      "2026-05-24",
      0,
      { force: true },
      nodeFs,
    );
    assert.equal(r.status, "sealed");
    // New parts land on slots ≥5 with matching headers; the legacy 1–4 untouched.
    r.parts.forEach((p) => {
      const n = Number(p.match(/-part(\d+)\.md$/)[1]);
      assert.ok(n >= 5, "new parts continue past the occupied slots");
      assert.ok(
        readFileSync(p, "utf-8").startsWith(`${H1(n)}\n`),
        `slot ${n} H1`,
      );
    });
    for (let n = 1; n <= 4; n++) {
      assert.equal(readFileSync(slot(n), "utf-8"), `${H1(n)}\nold\n`);
    }
  });

  test("force-rotate of a single chunk onto slot 5 reads (part 5), not (part 1 of 1)", () => {
    for (let n = 1; n <= 4; n++) writeFileSync(slot(n), `${H1(n)}\nold\n`);
    // A small single-day log: seals as one chunk onto the next free slot (5).
    writeFileSync(mainPath(), `${H1()}\n## 2026-05-19\nfiller\nfiller\n`);
    const r = rotateIfOverBudget(
      wikiRoot,
      "staff-engineer",
      "2026-05-24",
      0,
      { force: true },
      nodeFs,
    );
    assert.equal(r.status, "sealed");
    assert.equal(r.parts.length, 1);
    assert.match(r.parts[0], /-part5\.md$/);
    assert.match(
      readFileSync(r.parts[0], "utf-8"),
      /^# Staff Engineer — 2026-W21 \(part 5\)\n/,
    );
    assert.doesNotMatch(readFileSync(r.parts[0], "utf-8"), /part 1 of 1/);
  });

  test("re-bisecting a part on slot 2 beside parts 1,3 numbers each sub-part by its slot", () => {
    // Occupy slots 1 and 3; slot 2 is the over-budget part to re-bisect.
    writeFileSync(slot(1), `${H1(1)}\nkept\n`);
    writeFileSync(slot(3), `${H1(3)}\nkept\n`);
    let over = `${H1(2)}\n`;
    for (let s = 0; s < 4; s++) {
      over += `## 2026-05-${String(18 + s).padStart(2, "0")}\n`;
      for (let i = 1; i < 150; i++) over += "filler\n";
    }
    writeFileSync(slot(2), over);
    const r = rebisectOverBudgetPart(slot(2), nodeFs);
    assert.equal(r.status, "resealed");
    // Source slot 2 keeps (part 2); fresh siblings take the next free slots (≥4).
    assert.match(
      readFileSync(slot(2), "utf-8"),
      /^# Staff Engineer — 2026-W21 \(part 2\)\n/,
    );
    r.parts.slice(1).forEach((p) => {
      const n = Number(p.match(/-part(\d+)\.md$/)[1]);
      assert.ok(n >= 4, "fresh siblings skip occupied slots 1,2,3");
      assert.ok(
        readFileSync(p, "utf-8").startsWith(`${H1(n)}\n`),
        `slot ${n} H1`,
      );
    });
    // Slots 1 and 3 are byte-identical (never renumbered).
    assert.equal(readFileSync(slot(1), "utf-8"), `${H1(1)}\nkept\n`);
    assert.equal(readFileSync(slot(3), "utf-8"), `${H1(3)}\nkept\n`);
  });
});
