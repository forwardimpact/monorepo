#!/usr/bin/env node
/**
 * Split a Workday CV-bundle PDF into per-candidate CV.pdf files.
 *
 * Workday's "bundle" export concatenates every candidate's attachments (CV,
 * cover letter, certificates) into one PDF with NO per-candidate separator page.
 * The only reliable delimiter is the PDF outline (bookmarks): exactly one flat,
 * depth-0 bookmark per candidate whose destination is that candidate's first
 * page. Candidate i occupies pages [bookmark(i), bookmark(i+1) - 1]; the last
 * candidate runs to the end of the file. Everything before the first bookmark is
 * the front-matter Table of Contents and is skipped.
 *
 * This script reads the outline (pdfjs-dist), matches each bookmark title to a
 * canonical candidate name from the parsed Workday roster (so folder names agree
 * with req-workday), extracts the page range losslessly (pdf-lib), and writes it
 * to Knowledge/Candidates/{Clean Name}/CV.pdf.
 *
 * It ALWAYS emits a JSON manifest describing every mapping and never overwrites
 * an existing CV.pdf. With --dry-run it computes the manifest without touching
 * disk. Multi-part bundles (`..._1_of_4.pdf` … `_4_of_4.pdf`) are self-contained:
 * pass all parts as positional arguments; each part is processed independently.
 *
 * The roster is the stdout JSON of req-workday/scripts/parse-workday.mjs
 * ({ requisition, candidates: [{ name, cleanName, ... }] }) — the single source
 * of truth for candidate names, so this script needs no XLSX parser of its own.
 *
 * Requires (bun install): pdfjs-dist, pdf-lib.
 *
 * Usage:
 *   node split-bundle.mjs <bundle.pdf> [<bundle2.pdf> ...] \
 *       --roster <roster.json> \
 *       --candidates-dir <Knowledge/Candidates> \
 *       --manifest <out.json> \
 *       [--dry-run]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

let PDFDocument, pdfjs;
try {
  ({ PDFDocument } = await import("pdf-lib"));
  pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
} catch {
  console.error(
    "Error: pdfjs-dist and/or pdf-lib not found. Install them first:\n  bun install pdfjs-dist pdf-lib",
  );
  process.exit(1);
}

// --- CLI parsing --------------------------------------------------------------

if (
  process.argv.includes("-h") ||
  process.argv.includes("--help") ||
  process.argv.length < 3
) {
  console.log(`split-bundle — split a Workday CV bundle into per-candidate CV.pdf by PDF bookmarks

Usage:
  node split-bundle.mjs <bundle.pdf> [<bundle2.pdf> ...] --roster <roster.json> \\
       --candidates-dir <dir> --manifest <out.json> [--dry-run]

  <roster.json> is the stdout of req-workday/scripts/parse-workday.mjs.`);
  process.exit(process.argv.length < 3 ? 1 : 0);
}

function optValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length
    ? process.argv[i + 1]
    : undefined;
}

const dryRun = process.argv.includes("--dry-run");
const rosterPath = optValue("--roster");
const candidatesDir = optValue("--candidates-dir");
const manifestPath = optValue("--manifest");
const FLAGS_WITH_VALUE = new Set([
  "--roster",
  "--candidates-dir",
  "--manifest",
]);
const bundles = process.argv.slice(2).filter((a, i, arr) => {
  if (a.startsWith("--")) return false;
  const prev = arr[i - 1];
  return !(prev && FLAGS_WITH_VALUE.has(prev)); // drop values consumed by flags
});

if (!candidatesDir || !manifestPath || bundles.length === 0) {
  console.error(
    "Error: need <bundle.pdf...>, --candidates-dir, and --manifest.",
  );
  process.exit(1);
}

// --- Name normalization & matching -------------------------------------------

const SUFFIX_RE = /\b(internal|referral|prior worker|external|contractor)\b/gi;
const PAREN_RE = /\([^)]*\)/g;

/** Fold a display name to a comparable key: no parentheticals, no diacritics,
 * lowercase alphanumerics only, whitespace collapsed. */
function normalize(name) {
  let s = name || "";
  s = s.replace(PAREN_RE, " ").replace(SUFFIX_RE, " ");
  s = s.normalize("NFKD").replace(/\p{M}/gu, ""); // strip combining accents
  s = s.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** Make a bookmark title safe as a directory name (used only when unmatched). */
function sanitizeFolder(title) {
  const s = (title || "").replace(/[/\\]/g, "-").replace(/\s+/g, " ").trim();
  return s || "UNKNOWN";
}

class Roster {
  constructor(candidates) {
    this.byExact = new Map(); // normalized name -> canonical cleanName
    this.byTokens = new Map(); // sorted-token key -> canonical cleanName
    this.all = []; // [{ key, clean }]
    for (const c of candidates) {
      const clean = (c.cleanName || c.name || "").trim();
      if (!clean) continue;
      const key = normalize(clean);
      if (!key) continue;
      if (!this.byExact.has(key)) this.byExact.set(key, clean);
      const tkey = key.split(" ").sort().join(" ");
      if (!this.byTokens.has(tkey)) this.byTokens.set(tkey, clean);
      this.all.push({ key, clean });
    }
  }

  /** Return { clean, method } — conservative: exact key, then token-set equality. */
  match(title) {
    const key = normalize(title);
    if (!key) return { clean: null, method: "unmatched" };
    if (this.byExact.has(key))
      return { clean: this.byExact.get(key), method: "exact" };
    const tkey = key.split(" ").sort().join(" ");
    if (this.byTokens.has(tkey))
      return { clean: this.byTokens.get(tkey), method: "token-set" };
    return { clean: null, method: "unmatched" };
  }

  /** Nearest roster names by shared-token count — helps a human resolve a miss. */
  hints(title, limit = 3) {
    const tokens = new Set(normalize(title).split(" ").filter(Boolean));
    const scored = [];
    for (const { key, clean } of this.all) {
      const shared = key.split(" ").filter((t) => tokens.has(t)).length;
      if (shared) scored.push({ shared, clean });
    }
    scored.sort(
      (a, b) => b.shared - a.shared || a.clean.localeCompare(b.clean),
    );
    const out = [];
    for (const { clean } of scored) {
      if (!out.includes(clean)) out.push(clean);
      if (out.length >= limit) break;
    }
    return out;
  }
}

// --- PDF outline handling -----------------------------------------------------

/** Return [{ title, page }] (0-based page index) for every outline destination,
 * in document order. pdfjs resolves both named and explicit destinations. */
async function readOutline(doc) {
  const outline = (await doc.getOutline()) || [];
  const items = [];

  async function pageIndex(dest) {
    const explicit =
      typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || !explicit[0]) return null;
    try {
      return await doc.getPageIndex(explicit[0]);
    } catch {
      return null;
    }
  }

  // Flatten defensively (Workday bundles are flat, depth-0).
  const stack = [...outline];
  while (stack.length) {
    const node = stack.shift();
    const page = await pageIndex(node.dest);
    if (node.title != null && page != null)
      items.push({ title: String(node.title), page });
    if (Array.isArray(node.items) && node.items.length)
      stack.unshift(...node.items);
  }
  items.sort((a, b) => a.page - b.page);
  return items;
}

function partLabel(path) {
  const m = basename(path).match(/_(\d+)_of_(\d+)\b/);
  return m ? `${m[1]}/${m[2]}` : null;
}

// --- Main ---------------------------------------------------------------------

let requisition = {};
let rosterCandidates = [];
if (rosterPath && existsSync(rosterPath)) {
  const data = JSON.parse(readFileSync(rosterPath, "utf8"));
  rosterCandidates = data.candidates || [];
  requisition = data.requisition || {};
}
const roster = new Roster(rosterCandidates);

const entries = [];
const matchedClean = new Set(); // normalized cleanNames that got a bookmark
const folderWritten = new Map(); // folder -> count (within this run, for collisions)

for (const bundle of bundles) {
  // pdfjs detaches the ArrayBuffer it's handed, so give each library its own copy.
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(bundle)),
    useSystemFonts: true,
    verbosity: 0,
  }).promise;
  const outline = await readOutline(doc);
  const part = partLabel(bundle);

  if (outline.length === 0) {
    entries.push({
      bundle,
      part,
      status: "no-outline",
      note: "No PDF bookmarks found — cannot split this file by candidate.",
    });
    continue;
  }

  // pdf-lib source (only loaded when we actually extract).
  let src = null;
  let total = 0;
  if (!dryRun) {
    src = await PDFDocument.load(new Uint8Array(readFileSync(bundle)));
    total = src.getPageCount();
  } else {
    total = doc.numPages;
  }

  for (let i = 0; i < outline.length; i++) {
    const start = outline[i].page;
    const end = i + 1 < outline.length ? outline[i + 1].page - 1 : total - 1;
    const title = outline[i].title;
    const { clean, method } = roster.match(title);
    const matched = clean != null;
    let folder, status, hints;
    if (matched) {
      matchedClean.add(normalize(clean));
      folder = clean;
      status = "matched";
      hints = [];
    } else {
      folder = sanitizeFolder(title);
      status = "unmatched";
      hints = roster.hints(title);
    }

    const destDir = join(candidatesDir, folder);
    const cvPath = join(destDir, "CV.pdf");
    const seen = folderWritten.get(folder) || 0;
    const existingCv = existsSync(cvPath);
    let outName;
    if (seen > 0) {
      outName = `CV-dup-${seen + 1}.pdf`;
      if (matched) status = "collision";
    } else if (existingCv) {
      outName = "CV-workday.pdf";
      if (matched) status = "existing-cv";
    } else {
      outName = "CV.pdf";
    }
    folderWritten.set(folder, seen + 1);
    const outPath = join(destDir, outName);

    let action = dryRun ? "would-write" : "pending";
    if (!dryRun) {
      try {
        mkdirSync(destDir, { recursive: true });
        const out = await PDFDocument.create();
        const idxs = [];
        for (let p = start; p <= end; p++) idxs.push(p);
        const copied = await out.copyPages(src, idxs);
        for (const pg of copied) out.addPage(pg);
        writeFileSync(outPath, await out.save());
        action = "wrote";
      } catch (exc) {
        action = `error: ${exc.message || exc}`;
      }
    }

    entries.push({
      bundle,
      part,
      order: i + 1,
      title,
      page_start: start + 1, // 1-based for humans
      page_end: end + 1,
      page_count: end - start + 1,
      matched,
      match_method: method,
      clean_name: clean || "",
      folder,
      status,
      out_path: outPath,
      action,
      hints,
    });
  }
}

const rosterUnmatched = [
  ...new Set(
    rosterCandidates
      .map((c) => c.cleanName || c.name)
      .filter((n) => n && !matchedClean.has(normalize(n))),
  ),
].sort();

const bookmarkEntries = entries.filter((e) => "title" in e);
const summary = {
  bundles: bundles.length,
  bookmarks_total: bookmarkEntries.length,
  matched: bookmarkEntries.filter((e) => e.matched).length,
  unmatched_bookmarks: bookmarkEntries.filter((e) => !e.matched).length,
  collisions: bookmarkEntries.filter((e) => e.status === "collision").length,
  existing_cv: bookmarkEntries.filter((e) => e.status === "existing-cv").length,
  roster_total: rosterCandidates.length,
  roster_unmatched: rosterUnmatched.length,
};

const manifest = {
  generated_from: bundles,
  requisition,
  candidates_dir: candidatesDir,
  dry_run: dryRun,
  summary,
  entries,
  roster_unmatched_names: rosterUnmatched,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

// Human summary to stdout.
const mode = dryRun ? "DRY RUN — nothing written" : "COMMIT";
console.log(
  `[${mode}] ${requisition.id || "?"} ${requisition.title || ""}`.trimEnd(),
);
console.log(`  bundles:            ${summary.bundles}`);
console.log(`  bookmarks:          ${summary.bookmarks_total}`);
console.log(`  matched → roster:   ${summary.matched}`);
console.log(`  unmatched bookmark: ${summary.unmatched_bookmarks}`);
console.log(`  collisions (dupes): ${summary.collisions}`);
console.log(`  existing CV.pdf:    ${summary.existing_cv}`);
console.log(
  `  roster w/o bookmark:${summary.roster_unmatched} (of ${summary.roster_total})`,
);
console.log(`  manifest:           ${manifestPath}`);
if (summary.unmatched_bookmarks) {
  console.log("  ⚠ unmatched bookmarks (resolve in the manifest):");
  for (const e of bookmarkEntries) {
    if (!e.matched) {
      const hint = e.hints.length ? `  ~ ${e.hints.join(", ")}` : "";
      console.log(
        `      - "${e.title}" (p${e.page_start}-${e.page_end})${hint}`,
      );
    }
  }
}
