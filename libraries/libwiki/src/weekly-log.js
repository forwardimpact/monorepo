import path from "node:path";
import { isoWeekString } from "@forwardimpact/libutil";
import { countLines, countWords } from "./budget.js";
import {
  WEEKLY_LOG_LINE_BUDGET,
  WEEKLY_LOG_WORD_BUDGET,
} from "./constants.js";

// ISO week computation lives in libutil's calendar util (the one place a
// `new Date` is allowed); re-exported here for the existing public surface.
export { isoWeek } from "@forwardimpact/libutil";

/** Return the path of the current weekly log file for an agent. */
export function weeklyLogPath(wikiRoot, agent, today) {
  return path.join(wikiRoot, `${agent}-${isoWeekString(today)}.md`);
}

function nextPartIndex(filePath, fs) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ".md");
  let n = 1;
  while (fs.existsSync(path.join(dir, `${base}-part${n}.md`))) n++;
  return n;
}

function partPathAt(filePath, n) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ".md");
  return path.join(dir, `${base}-part${n}.md`);
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

  // Zero day-sections: the whole body is the prologue and its own single part.
  if (seams.length === 0) {
    const measured = measure(body);
    const residue =
      measured.lines > WEEKLY_LOG_LINE_BUDGET ||
      measured.words > WEEKLY_LOG_WORD_BUDGET
        ? {
            section: "prologue",
            lines: measured.lines,
            words: measured.words,
            partIndex: 0,
          }
        : null;
    return finish([body], residue);
  }

  const prologue = body.slice(0, seams[0].offset);
  const sections = seams.map((s, i) => ({
    date: s.date,
    text: body.slice(
      s.offset,
      i + 1 < seams.length ? seams[i + 1].offset : body.length,
    ),
  }));

  const partBodies = [];
  let residue = null;
  let current = prologue;
  let currentEmpty = prologue.length === 0;

  for (const sec of sections) {
    if (overBudget(sec.text)) {
      // Irreducible lone day-section: flush the open part, then seal it alone.
      if (!currentEmpty) {
        partBodies.push(current);
        current = "";
        currentEmpty = true;
      }
      const partIndex = partBodies.length;
      partBodies.push(sec.text);
      if (residue === null) {
        const measured = measure(sec.text);
        residue = {
          section: sec.date,
          lines: measured.lines,
          words: measured.words,
          partIndex,
        };
      }
      continue;
    }
    if (currentEmpty) {
      current = sec.text;
      currentEmpty = false;
    } else if (overBudget(current + sec.text)) {
      partBodies.push(current);
      current = sec.text;
    } else {
      current += sec.text;
    }
  }
  if (!currentEmpty) partBodies.push(current);

  return finish(partBodies, residue);
}

/**
 * Stage every part at its slot and the fresh-main body at temps, then commit
 * by renaming each part onto its `-partN.md` slot and the fresh main over
 * `filePath` as the single final step. On any failure before that last rename,
 * unlink every committed slot and remaining temp this seal wrote and re-throw,
 * so the source's path/contents/inode are untouched. Returns the produced slot
 * paths in part order.
 *
 * @param {string} filePath - The current weekly-log path.
 * @param {Array<{h1: string, body: string}>} parts - Ordered parts to seal.
 * @param {string} agent
 * @param {string} isoWeekStr
 * @param {object} fs - Sync filesystem surface.
 * @returns {string[]} The `-partN.md` slot paths, in part order.
 */
function atomicSeal(filePath, parts, agent, isoWeekStr, fs) {
  const start = nextPartIndex(filePath, fs);
  const slots = parts.map((_, i) => partPathAt(filePath, start + i));
  const mainTemp = `${filePath}.tmp`;
  const temps = []; // temp paths this seal wrote, for rollback
  const committed = []; // slots already renamed into place, for rollback
  try {
    // Stage every part and the fresh main at temp files.
    slots.forEach((slot, i) => {
      const tmp = `${slot}.tmp`;
      fs.writeFileSync(tmp, `${parts[i].h1}\n${parts[i].body}`);
      temps.push(tmp);
    });
    fs.writeFileSync(mainTemp, defaultH1(agent, isoWeekStr));
    temps.push(mainTemp);
    // Commit: parts onto their slots, then the fresh main as the final step.
    slots.forEach((slot, i) => {
      fs.renameSync(`${slot}.tmp`, slot);
      committed.push(slot);
      // The part temp is consumed by its rename; drop it from the rollback set.
      temps.splice(temps.indexOf(`${slot}.tmp`), 1);
    });
    fs.renameSync(mainTemp, filePath);
    return slots;
  } catch (e) {
    for (const slot of committed) {
      try {
        fs.unlinkSync(slot);
      } catch {}
    }
    for (const tmp of temps) {
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }
    throw e;
  }
}

/**
 * Rotate the current weekly log, sealing an over-budget source into
 * budget-conforming parts via a bisecting seal. Returns a tagged union:
 * `{status:"noop"}` (no rotation needed), `{status:"sealed",parts}` (sealed
 * into one-or-more conforming parts), or `{status:"incomplete",parts,residue}`
 * (a lone day-section exceeds a budget and is named).
 *
 * @returns {{status: "noop"|"sealed"|"incomplete", fromPath: string, parts?: string[], residue?: {path: string, section: string, lines: number, words: number}}}
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
  if (!fs.existsSync(filePath)) return { status: "noop", fromPath: filePath };
  const text = fs.readFileSync(filePath, "utf-8");
  const current = countLines(text);
  if (!force && current + appendLines <= WEEKLY_LOG_LINE_BUDGET) {
    return { status: "noop", fromPath: filePath };
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
