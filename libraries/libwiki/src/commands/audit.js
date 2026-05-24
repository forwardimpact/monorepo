import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import fsAsync from "node:fs/promises";
import path from "node:path";
import { Finder } from "@forwardimpact/libutil";
import {
  ACTIVE_CLAIMS_HEADING,
  ACTIVE_CLAIMS_TABLE_HEADER,
  DECISION_HEADING,
  MEMO_INBOX_MARKER,
  PRIORITY_INDEX_HEADING,
  SUMMARY_LINE_BUDGET,
  SUMMARY_WORD_BUDGET,
  WEEKLY_LOG_LINE_BUDGET,
  WEEKLY_LOG_WORD_BUDGET,
} from "../constants.js";
import { parseClaims, filterExpired } from "../active-claims.js";

const SUMMARY_H1_RE = /^# [A-Z].* — Summary$/;
const WEEKLY_LOG_NAME_RE = /^[a-z-]+-(\d{4})-W(\d{2})\.md$/;
const WEEKLY_LOG_PART_NAME_RE = /^[a-z-]+-(\d{4})-W(\d{2})-part\d+\.md$/;
const WEEKLY_LOG_H1_RE = /^# .* — \d{4}-W\d{2}(?: \(part \d+ of \d+\))?$/;
const ENTRY_RE = /^## \d{4}-\d{2}-\d{2}(?:[\s(].*)?$/;

const EXCLUDED_SUMMARY_BASES = new Set(["MEMORY.md", "Home.md", "STATUS.md"]);
const NON_SUMMARY_PREFIXES = [
  "storyboard-",
  "downstream-",
  "memory-protocol-",
  "kata-interview-",
  "fit-trace-",
];

function hasNonSummaryPrefix(base) {
  return NON_SUMMARY_PREFIXES.some((p) => base.startsWith(p));
}

function isSummaryFile(wikiRoot, filePath) {
  const rel = path.relative(wikiRoot, filePath);
  if (rel.includes(path.sep) || !rel.endsWith(".md")) return false;
  const base = path.basename(rel);
  if (EXCLUDED_SUMMARY_BASES.has(base)) return false;
  if (hasNonSummaryPrefix(base)) return false;
  if (WEEKLY_LOG_NAME_RE.test(base) || WEEKLY_LOG_PART_NAME_RE.test(base)) {
    return false;
  }
  try {
    const text = readFileSync(filePath, "utf-8");
    const firstLine = text.split("\n").find((l) => l.trim() !== "");
    return Boolean(firstLine && SUMMARY_H1_RE.test(firstLine));
  } catch {
    return false;
  }
}

function listMdFiles(wikiRoot) {
  if (!existsSync(wikiRoot)) return [];
  return readdirSync(wikiRoot)
    .filter((e) => e.endsWith(".md"))
    .map((e) => path.join(wikiRoot, e))
    .filter((f) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    });
}

function countLines(text) {
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function countWords(text) {
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const isWs = c === 32 || c === 9 || c === 10 || c === 13;
    if (isWs) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      count++;
    }
  }
  return count;
}

function pushFail(findings, level, message) {
  findings.push({ level, message });
}

function inGraceWindow(graceUntil, today) {
  return Boolean(graceUntil && graceUntil >= today);
}

function checkSummaryStructure(f, text, fileLines, h2s, findings) {
  const firstLine = fileLines.find((l) => l.trim() !== "");
  if (!firstLine || !SUMMARY_H1_RE.test(firstLine)) {
    pushFail(findings, "fail", `sections: ${f} missing H1 '# ... — Summary'`);
  }
  if (!/^\*\*Last run\*\*:/m.test(text)) {
    pushFail(findings, "fail", `sections: ${f} missing '**Last run**:' line`);
  }
  if (h2s.length > 0 && h2s[0] !== "Message Inbox") {
    pushFail(
      findings,
      "fail",
      `sections: ${f} first H2 is '${h2s[0]}', expected 'Message Inbox'`,
    );
  }
  if (h2s.indexOf("Message Inbox") !== -1) {
    const markerIdx = fileLines.findIndex(
      (l) => l.trim() === MEMO_INBOX_MARKER,
    );
    if (markerIdx === -1) {
      pushFail(
        findings,
        "fail",
        `sections: ${f} missing <!-- memo:inbox --> marker`,
      );
    }
  }
}

function checkSummaryOrdering(f, h2s, findings) {
  let seenBlockers = false;
  for (const h of h2s) {
    if (h === "Open Blockers") {
      seenBlockers = true;
      continue;
    }
    if (seenBlockers) {
      pushFail(
        findings,
        "fail",
        `sections: ${f} '${h}' appears after 'Open Blockers'`,
      );
    }
  }
}

function checkSummaryFile(f, findings, grace) {
  const text = readFileSync(f, "utf-8");
  const lines = countLines(text);
  if (lines > SUMMARY_LINE_BUDGET) {
    pushFail(
      findings,
      grace ? "warn" : "fail",
      `budget: ${f} has ${lines} lines (limit ${SUMMARY_LINE_BUDGET})`,
    );
  }
  const words = countWords(text);
  if (words > SUMMARY_WORD_BUDGET) {
    pushFail(
      findings,
      grace ? "warn" : "fail",
      `budget: ${f} has ${words} words (limit ${SUMMARY_WORD_BUDGET})`,
    );
  }
  const fileLines = text.split("\n");
  const h2s = [];
  for (const line of fileLines) {
    const m = line.match(/^## (.+)$/);
    if (m) h2s.push(m[1].trim());
  }
  checkSummaryStructure(f, text, fileLines, h2s, findings);
  checkSummaryOrdering(f, h2s, findings);
}

function checkSummaries(wikiRoot, files, findings, options) {
  const grace = inGraceWindow(options.graceUntil, options.today);
  for (const f of files) {
    if (!isSummaryFile(wikiRoot, f)) continue;
    checkSummaryFile(f, findings, grace);
  }
}

function entryHasDecision(allLines, startIdx) {
  let nonBlankSeen = 0;
  for (let j = startIdx + 1; j < allLines.length && nonBlankSeen < 5; j++) {
    const ln = allLines[j];
    if (ln.trim() === "") continue;
    nonBlankSeen++;
    if (ln.trim() === DECISION_HEADING) return true;
    if (/^##\s/.test(ln)) return false;
  }
  return false;
}

function checkDecisionBlocks(f, text, findings, grace) {
  const allLines = text.split("\n");
  for (let i = 0; i < allLines.length; i++) {
    if (!ENTRY_RE.test(allLines[i])) continue;
    if (entryHasDecision(allLines, i)) continue;
    pushFail(
      findings,
      grace ? "warn" : "fail",
      `decision-block: ${f}:${i + 1} entry lacks leading '### Decision'`,
    );
  }
}

function checkWeeklyLogFile(f, base, findings, grace) {
  const isMain = WEEKLY_LOG_NAME_RE.test(base);
  const isPart = WEEKLY_LOG_PART_NAME_RE.test(base);
  if (!isMain && !isPart) return;
  const text = readFileSync(f, "utf-8");
  const firstLine = text.split("\n").find((l) => l.trim() !== "");
  if (!firstLine || !WEEKLY_LOG_H1_RE.test(firstLine)) {
    pushFail(findings, "fail", `weekly-log: ${f} missing valid H1 heading`);
  }
  const lines = countLines(text);
  if (lines > WEEKLY_LOG_LINE_BUDGET) {
    pushFail(
      findings,
      "fail",
      `weekly-log: ${f} has ${lines} lines (limit ${WEEKLY_LOG_LINE_BUDGET})`,
    );
  }
  const words = countWords(text);
  if (words > WEEKLY_LOG_WORD_BUDGET) {
    pushFail(
      findings,
      "fail",
      `weekly-log: ${f} has ${words} words (limit ${WEEKLY_LOG_WORD_BUDGET})`,
    );
  }
  if (isMain) {
    checkDecisionBlocks(f, text, findings, grace);
  }
}

function checkWeeklyLogs(_wikiRoot, files, findings, options) {
  const grace = inGraceWindow(options.graceUntil, options.today);
  for (const f of files) {
    checkWeeklyLogFile(f, path.basename(f), findings, grace);
  }
}

function checkPriorityIndex(wikiRoot, findings) {
  const memPath = path.join(wikiRoot, "MEMORY.md");
  if (!existsSync(memPath)) {
    pushFail(findings, "fail", `memory: ${memPath} not found`);
    return;
  }
  const text = readFileSync(memPath, "utf-8");
  if (!new RegExp(`^${PRIORITY_INDEX_HEADING}$`, "m").test(text)) {
    pushFail(
      findings,
      "fail",
      "memory: missing '## Cross-Cutting Priorities' heading",
    );
  }
  const headerRe =
    /^\|\s*Item\s*\|\s*Agents\s*\|\s*Owner\s*\|\s*Status\s*\|\s*Added\s*\|/m;
  if (!headerRe.test(text)) {
    pushFail(findings, "fail", "memory: missing priority table header row");
  }
}

function findActiveClaimsHeader(lines, headingIdx) {
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) return -1;
    if (lines[i].startsWith("|") && /agent/.test(lines[i])) return i;
  }
  return -1;
}

function checkActiveClaimsRows(claims, findings, today) {
  for (const c of claims) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.expires_at)) {
      pushFail(
        findings,
        "fail",
        `active-claims: bad expires_at '${c.expires_at}' for ${c.agent}/${c.target}`,
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.claimed_at)) {
      pushFail(
        findings,
        "fail",
        `active-claims: bad claimed_at '${c.claimed_at}' for ${c.agent}/${c.target}`,
      );
    }
  }
  const { expired } = filterExpired(claims, today);
  for (const c of expired) {
    pushFail(
      findings,
      "warn",
      `expired-claim: ${c.agent}/${c.target} expired ${c.expires_at}`,
    );
  }
}

function checkActiveClaims(wikiRoot, findings, options) {
  const memPath = path.join(wikiRoot, "MEMORY.md");
  if (!existsSync(memPath)) return;
  const text = readFileSync(memPath, "utf-8");
  if (!new RegExp(`^${ACTIVE_CLAIMS_HEADING}$`, "m").test(text)) return;
  const lines = text.split("\n");
  const headingIdx = lines.findIndex((l) => l.trim() === ACTIVE_CLAIMS_HEADING);
  const headerIdx = findActiveClaimsHeader(lines, headingIdx);
  if (
    headerIdx === -1 ||
    lines[headerIdx].trim() !== ACTIVE_CLAIMS_TABLE_HEADER
  ) {
    pushFail(
      findings,
      "fail",
      `active-claims: header mismatch (expected ${ACTIVE_CLAIMS_TABLE_HEADER})`,
    );
  }
  checkActiveClaimsRows(parseClaims(text), findings, options.today);
}

function emitText(failures, warnings) {
  for (const w of warnings) process.stdout.write(`WARN ${w.message}\n`);
  for (const f of failures) process.stdout.write(`FAIL ${f.message}\n`);
  if (failures.length === 0) {
    process.stdout.write("RESULT: pass\n");
  } else {
    process.stdout.write(`RESULT: fail (${failures.length} checks failed)\n`);
  }
}

function emitJson(failures, warnings, graceUntil, today) {
  process.stdout.write(
    JSON.stringify(
      {
        result: failures.length === 0 ? "pass" : "fail",
        failures,
        warnings,
        grace_active: inGraceWindow(graceUntil, today),
        grace_until: graceUntil,
      },
      null,
      2,
    ) + "\n",
  );
}

/** Run the wiki audit and emit findings. JSON via --format json. */
export function runAuditCommand(values, _args, _cli) {
  const logger = { debug() {} };
  const finder = new Finder(fsAsync, logger, process);
  const projectRoot = finder.findProjectRoot(process.cwd());
  const wikiRoot = values["wiki-root"] || path.join(projectRoot, "wiki");
  const today = values.today || new Date().toISOString().slice(0, 10);
  const graceUntil = process.env.FIT_WIKI_AUDIT_GRACE_UNTIL || null;
  const legacyOnly = !!values["legacy-only"];

  const findings = [];
  const files = listMdFiles(wikiRoot);

  checkSummaries(wikiRoot, files, findings, { graceUntil, today });
  checkWeeklyLogs(wikiRoot, files, findings, { graceUntil, today });
  checkPriorityIndex(wikiRoot, findings);
  if (!legacyOnly) {
    checkActiveClaims(wikiRoot, findings, { today });
  }

  const failures = findings.filter((f) => f.level === "fail");
  const warnings = findings.filter((f) => f.level === "warn");

  if ((values.format || "text") === "json") {
    emitJson(failures, warnings, graceUntil, today);
  } else {
    emitText(failures, warnings);
  }

  if (failures.length > 0) process.exit(1);
}
