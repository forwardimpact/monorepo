import path from "node:path";
import { isoWeekString } from "@forwardimpact/libutil";
import { countLines, countWords } from "./budget.js";
import {
  WEEKLY_LOG_LINE_BUDGET,
  WEEKLY_LOG_PART_NAME_RE,
  WEEKLY_LOG_WORD_BUDGET,
} from "./constants.js";

// ISO week computation lives in libutil's calendar util (the one place a
// `new Date` is allowed); re-exported here for the existing public surface.
export { isoWeek } from "@forwardimpact/libutil";

/** Return the path of the current weekly log file for an agent. */
export function weeklyLogPath(wikiRoot, agent, today) {
  return path.join(wikiRoot, `${agent}-${isoWeekString(today)}.md`);
}

function partPathAt(filePath, n) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ".md");
  return path.join(dir, `${base}-part${n}.md`);
}

// Find `count` part slots that are each verified free, skipping any occupied
// `-partN.md` (e.g. a numbering gap left by a manually deleted middle part).
// Every returned slot is unoccupied, so the seal never overwrites a pre-existing
// part on commit nor unlinks one on rollback.
function nextFreeSlots(filePath, count, fs) {
  const slots = [];
  let n = 1;
  while (slots.length < count) {
    const p = partPathAt(filePath, n);
    if (!fs.existsSync(p)) slots.push(p);
    n++;
  }
  return slots;
}

function agentTitle(agent) {
  return agent
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function defaultH1(agent, isoWeekStr) {
  return `# ${agentTitle(agent)} — ${isoWeekStr}\n`;
}

/** Describe a lone over-cap day-section as a residue at its part index. */
function residueOf(sec, partIndex, measure) {
  const { lines, words } = measure(sec.text);
  return { section: sec.date, lines, words, partIndex };
}

/**
 * An over-cap prologue cannot merge with any day-section (adding content only
 * grows it), so it always seals as its own part 0. Flag it up front as the
 * first residue so it is never shipped silently over budget.
 */
function prologueResidue(prologue, { overBudget, measure }) {
  if (prologue.length === 0 || !overBudget(prologue)) return null;
  const { lines, words } = measure(prologue);
  return { section: "prologue", lines, words, partIndex: 0 };
}

/**
 * Greedily pack day-sections into part bodies under both budgets, the prologue
 * riding with part 1. A chunk that alone exceeds a budget — a lone day-section
 * or an over-cap prologue — is sealed as its own part and recorded as the
 * (first) residue; packed runs and single sections are kept under both budgets,
 * so the only over-cap part bodies are the ones `residue` accounts for.
 * @param {Array<{date: string, text: string}>} sections
 * @param {string} prologue - Content above the first seam; rides with part 1.
 * @param {{overBudget: (s: string) => boolean, measure: (s: string) => {lines: number, words: number}}} budget
 * @returns {{partBodies: string[], residue: null | {section: string, lines: number, words: number, partIndex: number}}}
 */
function packSections(sections, prologue, budget) {
  const { overBudget, measure } = budget;
  const partBodies = [];
  // The prologue, when over budget, is always pushed first (part 0) — record it
  // before packing so a later lone-section residue cannot displace it.
  let residue = prologueResidue(prologue, budget);
  let open = prologue; // body of the part currently being filled
  let opened = prologue.length > 0;
  const flush = () => {
    if (opened) {
      partBodies.push(open);
      open = "";
      opened = false;
    }
  };
  for (const sec of sections) {
    if (overBudget(sec.text)) {
      // Irreducible lone day-section: flush the open part, then seal it alone.
      flush();
      residue ??= residueOf(sec, partBodies.length, measure);
      partBodies.push(sec.text);
    } else if (!opened) {
      open = sec.text;
      opened = true;
    } else if (overBudget(open + sec.text)) {
      partBodies.push(open);
      open = sec.text;
    } else {
      open += sec.text;
    }
  }
  flush();
  return { partBodies, residue };
}

/**
 * Split an over-budget weekly-log source at its `## YYYY-MM-DD` day-section
 * seams into an ordered list of conforming parts. Pure — no I/O.
 *
 * The first line of `text` is the original H1; it is consumed and replaced by
 * per-part H1s, never appearing in a part body. Everything after that first
 * line is the body, sliced at the day-section seam byte offsets so that
 * concatenating the parts' bodies reproduces the original body byte-for-byte.
 * The prologue (any content above the first seam) rides with part 1. Sections
 * are greedily packed left-to-right under both the line- and word-budget, with
 * each candidate part measured H1-included so its own H1 is charged.
 *
 * When a single chunk alone exceeds a budget — a lone day-section, or the
 * whole prologue when the source has no day-sections — it is sealed as its own
 * (over-budget) part and named in `residue`; the rest still packs normally.
 *
 * @param {string} text - The full weekly-log source (H1 + body).
 * @param {string} agent - Agent profile id (e.g. "staff-engineer").
 * @param {string} isoWeekStr - ISO week label (e.g. "2026-W21").
 * @returns {{parts: Array<{h1: string, body: string}>, residue: null | {section: string, lines: number, words: number, partIndex: number}}}
 */
export function bisectWeeklyLog(text, agent, isoWeekStr) {
  const nl = text.indexOf("\n");
  const body = nl === -1 ? "" : text.slice(nl + 1);
  const title = agentTitle(agent);
  // `(part N of M)` costs the same 1 line and 4 word-tokens regardless of the
  // digits in N/M, so a fixed template measures every part exactly without
  // needing to know M before packing finishes.
  const h1Template = `# ${title} — ${isoWeekStr} (part 1 of 1)`;
  const measure = (chunk) => {
    const rendered = `${h1Template}\n${chunk}`;
    return { lines: countLines(rendered), words: countWords(rendered) };
  };
  const overBudget = (chunk) => {
    const { lines, words } = measure(chunk);
    return lines > WEEKLY_LOG_LINE_BUDGET || words > WEEKLY_LOG_WORD_BUDGET;
  };
  const partH1 = (n, m) => `# ${title} — ${isoWeekStr} (part ${n} of ${m})`;
  const finish = (partBodies, residue) => {
    const m = partBodies.length;
    return {
      parts: partBodies.map((b, i) => ({ h1: partH1(i + 1, m), body: b })),
      residue,
    };
  };

  // Locate the day-section seams (date at line-start, trailing suffix
  // tolerated, e.g. `## 2026-05-19 (third activation)`).
  const seamRe = /^## (\d{4}-\d{2}-\d{2})/gm;
  const seams = [];
  let match;
  while ((match = seamRe.exec(body)) !== null) {
    seams.push({ offset: match.index, date: match[1] });
  }

  // Zero day-sections: the whole body is the prologue and its own single part,
  // flagged as a residue when it alone exceeds a budget.
  if (seams.length === 0) {
    return finish([body], prologueResidue(body, { overBudget, measure }));
  }

  const prologue = body.slice(0, seams[0].offset);
  const sections = seams.map((s, i) => ({
    date: s.date,
    text: body.slice(
      s.offset,
      i + 1 < seams.length ? seams[i + 1].offset : body.length,
    ),
  }));

  const { partBodies, residue } = packSections(sections, prologue, {
    overBudget,
    measure,
  });
  return finish(partBodies, residue);
}

/**
 * Stage every write to `${path}.tmp`, then commit by renaming each `leading`
 * write onto its path (tracked for rollback) and the `anchor` write LAST — the
 * single point of no return. The anchor is the live/source file: until its
 * rename it still holds its original bytes, so a failure anywhere unlinks every
 * committed leading path and remaining temp and re-throws, leaving the anchor's
 * path/contents/inode untouched. Leading paths must be verified-free slots (a
 * rollback unlinks them). Returns the leading paths, in order.
 *
 * @param {Array<{path: string, content: string}>} leading - Committed first.
 * @param {{path: string, content: string}} anchor - Committed last.
 * @param {object} fs - Sync filesystem surface.
 * @returns {string[]} The leading paths, in commit order.
 */
function commitAtomic(leading, anchor, fs) {
  const temps = []; // temp paths written but not yet renamed, for rollback
  const committed = []; // leading paths already renamed into place, for rollback
  try {
    for (const w of [...leading, anchor]) {
      fs.writeFileSync(`${w.path}.tmp`, w.content);
      temps.push(`${w.path}.tmp`);
    }
    for (const w of leading) {
      fs.renameSync(`${w.path}.tmp`, w.path);
      committed.push(w.path);
      temps.splice(temps.indexOf(`${w.path}.tmp`), 1);
    }
    fs.renameSync(`${anchor.path}.tmp`, anchor.path);
    return committed;
  } catch (e) {
    for (const p of committed) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
    for (const t of temps) {
      try {
        fs.unlinkSync(t);
      } catch {}
    }
    throw e;
  }
}

/**
 * Seal a bisected weekly log: write each part to a fresh `-partN.md` slot and a
 * fresh empty main over `filePath` (the anchor, committed last). Returns the
 * `-partN.md` slot paths in part order.
 *
 * @param {string} filePath - The current weekly-log path.
 * @param {Array<{h1: string, body: string}>} parts - Ordered parts to seal.
 * @param {string} agent
 * @param {string} isoWeekStr
 * @param {object} fs - Sync filesystem surface.
 * @returns {string[]} The `-partN.md` slot paths, in part order.
 */
function atomicSeal(filePath, parts, agent, isoWeekStr, fs) {
  const slots = nextFreeSlots(filePath, parts.length, fs);
  const leading = slots.map((path, i) => ({
    path,
    content: `${parts[i].h1}\n${parts[i].body}`,
  }));
  const anchor = { path: filePath, content: defaultH1(agent, isoWeekStr) };
  return commitAtomic(leading, anchor, fs);
}

/**
 * Rotate the current weekly log, sealing an over-budget source into
 * budget-conforming parts via a bisecting seal. Returns a tagged union:
 * `{status:"noop"}` (no rotation needed), `{status:"sealed",parts}` (sealed
 * into one-or-more conforming parts), or `{status:"incomplete",parts,residue}`
 * (a lone day-section exceeds a budget and is named).
 *
 * A `noop` return carries a `reason` — `"missing"` (no file; no size measured),
 * `"floor"` (header-only/empty body; nothing to seal), or `"under-budget"`
 * (under both budgets without `--force`) — plus the measured `lines`/`words`
 * for the two reasons that read the file, so the CLI guard need not re-read it.
 * "Over budget" is decided here over *either* budget (lines or words), so a
 * caller never needs `force: true` to seal a word-over/line-under log.
 *
 * @returns {{status: "noop"|"sealed"|"incomplete", reason?: "missing"|"floor"|"under-budget", lines?: number, words?: number, fromPath: string, parts?: string[], residue?: {path: string, section: string, lines: number, words: number}}}
 * @param {string} wikiRoot
 * @param {string} agent
 * @param {string} today - ISO date string.
 * @param {number} [appendLines=0]
 * @param {{force?: boolean}} [options]
 * @param {object} fs - Sync filesystem surface (`runtime.fsSync`).
 */
export function rotateIfOverBudget(
  wikiRoot,
  agent,
  today,
  appendLines = 0,
  options = {},
  fs,
) {
  const filePath = weeklyLogPath(wikiRoot, agent, today);
  const { force = false } = options;
  if (!fs.existsSync(filePath)) {
    return { status: "noop", reason: "missing", fromPath: filePath };
  }
  const text = fs.readFileSync(filePath, "utf-8");
  const lines = countLines(text);
  const words = countWords(text);
  // A header-only (or empty) log has nothing to seal. Without this floor,
  // force-rotating a freshly-reset main would mint an empty `(part 1 of 1)`
  // file and reset the main again — once per invocation, forever. The floor
  // holds even under `--force`, so it is checked before the force branch.
  const nl = text.indexOf("\n");
  if ((nl === -1 ? "" : text.slice(nl + 1)).trim() === "") {
    return {
      status: "noop",
      reason: "floor",
      lines,
      words,
      fromPath: filePath,
    };
  }
  // Over either budget: a word-over/line-under log seals without `--force`.
  const overBudget =
    lines + appendLines > WEEKLY_LOG_LINE_BUDGET ||
    words > WEEKLY_LOG_WORD_BUDGET;
  if (!force && !overBudget) {
    return {
      status: "noop",
      reason: "under-budget",
      lines,
      words,
      fromPath: filePath,
    };
  }
  const isoWeekStr = isoWeekString(today);
  const { parts, residue } = bisectWeeklyLog(text, agent, isoWeekStr);
  const slots = atomicSeal(filePath, parts, agent, isoWeekStr, fs);
  if (residue === null) {
    return { status: "sealed", fromPath: filePath, parts: slots };
  }
  return {
    status: "incomplete",
    fromPath: filePath,
    parts: slots,
    residue: {
      path: slots[residue.partIndex],
      section: residue.section,
      lines: residue.lines,
      words: residue.words,
    },
  };
}

/**
 * Derive the agent, ISO week, and MAIN-log path from a sealed part's path. The
 * week comes from the filename (a part may belong to a past week, not today),
 * and the main-log path — not the part path — is what `nextFreeSlots` must base
 * new sibling slots on. Returns null for a non-conforming filename. Shares
 * WEEKLY_LOG_PART_NAME_RE with the audit's file classifier so the two cannot
 * drift on the filename convention.
 */
function parsePartPath(partPath) {
  const m = path.basename(partPath).match(WEEKLY_LOG_PART_NAME_RE);
  if (!m) return null;
  const [, agent, year, week] = m;
  const isoWeekStr = `${year}-W${week}`;
  return {
    agent,
    isoWeekStr,
    mainLogPath: path.join(path.dirname(partPath), `${agent}-${isoWeekStr}.md`),
  };
}

/**
 * Reseal a re-bisected part: the first sub-part overwrites the source slot (the
 * anchor, committed last) and the rest claim fresh sibling slots of the main-log
 * path. `nextFreeSlots` skips occupied slots (including the source's own), so a
 * commit never clobbers a sibling nor a rollback unlinks a pre-existing one.
 * Returns `[partPath, ...newSlots]` in part order.
 */
function atomicResealPart(partPath, mainLogPath, parts, fs) {
  const newSlots = nextFreeSlots(mainLogPath, parts.length - 1, fs);
  const leading = newSlots.map((path, i) => ({
    path,
    content: `${parts[i + 1].h1}\n${parts[i + 1].body}`,
  }));
  const anchor = {
    path: partPath,
    content: `${parts[0].h1}\n${parts[0].body}`,
  };
  commitAtomic(leading, anchor, fs);
  return [partPath, ...newSlots];
}

/**
 * Re-bisect a single over-budget sealed weekly-log PART in place. Agent and ISO
 * week come from the part filename. A part within both budgets is a noop; a part
 * whose body cannot be reduced (a lone over-cap day-section or an over-cap
 * zero-seam body) is left BYTE-IDENTICAL and reported `incomplete` with a
 * residue, so the re-audit re-flags it for a human. Otherwise the first sub-part
 * overwrites `partPath` (slot reused) and the remaining sub-parts land on fresh
 * sibling slots, with full rollback (source untouched on any failure).
 *
 * The produced sub-parts carry `bisectWeeklyLog`'s `(part i of M)` H1s, where M
 * is LOCAL to this part's split — not a global count of the week's parts.
 * Sibling parts are never renumbered (the audit does not validate the numbers).
 *
 * @param {string} partPath - Absolute path to an `<agent>-YYYY-Www-partN.md`.
 * @param {object} fs - Sync filesystem surface (`runtime.fsSync`).
 * @returns {{status: "noop"|"resealed"|"incomplete", fromPath: string, parts?: string[], residue?: {path: string, section: string, lines: number, words: number}}}
 */
export function rebisectOverBudgetPart(partPath, fs) {
  if (!fs.existsSync(partPath)) return { status: "noop", fromPath: partPath };
  const parsed = parsePartPath(partPath);
  if (!parsed) return { status: "noop", fromPath: partPath };
  const text = fs.readFileSync(partPath, "utf-8");
  const lines = countLines(text);
  const words = countWords(text);
  if (lines <= WEEKLY_LOG_LINE_BUDGET && words <= WEEKLY_LOG_WORD_BUDGET) {
    return { status: "noop", fromPath: partPath };
  }
  const { parts, residue } = bisectWeeklyLog(
    text,
    parsed.agent,
    parsed.isoWeekStr,
  );
  // A single produced part has no splittable seam: leave the file untouched and
  // surface a residue (synthesised from the file when the bisector did not name
  // one) so the caller's re-audit re-flags it.
  if (parts.length === 1) {
    const seam = text.match(/^## (\d{4}-\d{2}-\d{2})/m);
    const r = residue ?? {
      section: seam ? seam[1] : "prologue",
      lines,
      words,
    };
    return {
      status: "incomplete",
      fromPath: partPath,
      parts: [partPath],
      residue: {
        path: partPath,
        section: r.section,
        lines: r.lines,
        words: r.words,
      },
    };
  }
  const slots = atomicResealPart(partPath, parsed.mainLogPath, parts, fs);
  if (residue === null) {
    return { status: "resealed", fromPath: partPath, parts: slots };
  }
  return {
    status: "incomplete",
    fromPath: partPath,
    parts: slots,
    residue: {
      path: slots[residue.partIndex],
      section: residue.section,
      lines: residue.lines,
      words: residue.words,
    },
  };
}

/**
 * Append a body to a weekly log file. Creates it with an H1 if missing.
 * @param {string} filePath
 * @param {string} body
 * @param {string} agent
 * @param {string} today - ISO date string.
 * @param {object} fs - Sync filesystem surface (`runtime.fsSync`).
 */
export function appendEntry(filePath, body, agent, today, fs) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, defaultH1(agent, isoWeekString(today)));
  }
  const text = fs.readFileSync(filePath, "utf-8");
  const separator = text.endsWith("\n") ? "\n" : "\n\n";
  fs.writeFileSync(
    filePath,
    text + separator + body + (body.endsWith("\n") ? "" : "\n"),
  );
}
