/**
 * kb-validator — pure knowledge checks for one Outpost knowledge base.
 *
 * The module takes a KB root (the Obsidian vault that holds the numbered
 * tier directories) and an injected async `fs` surface. It returns findings.
 * It never logs, never exits, and never reads scheduler config. The only
 * files it consults besides the vault content are the vault-local
 * `registry.yaml` and `validation-baseline.json`.
 *
 * The frontmatter block-splitter is deliberately local. Reusing libdoc's
 * helper would pull a site-generator package into an end-user CLI for ten
 * lines of code.
 */

import { join, dirname } from "node:path";
import { parse as parseYaml } from "yaml";

/**
 * @typedef {object} Finding
 * @property {string} kind - One of the link, directory, or frontmatter kinds.
 * @property {boolean} baselined - True when a baseline entry matches.
 * @property {string} [file] - Source note, relative to the KB root.
 * @property {number} [line] - 1-based line of the link or property.
 * @property {string} [link] - The link target or path string as written.
 * @property {string|null} [sourceTier] - Tier directory name of the source.
 * @property {string|null} [targetTier] - Tier directory name of the target.
 * @property {string} [path] - Root entry a directory finding names.
 * @property {string} [property] - Frontmatter property a finding names.
 * @property {string|null} [value] - Offending frontmatter value.
 * @property {string} [message] - Human hint; legacy kinds name MIGRATION.md.
 */

/**
 * @typedef {object} Ctx
 * @property {object} fs - Injected async fs surface.
 * @property {string} kbRoot - Absolute vault root.
 * @property {Finding[]} findings - Accumulator.
 * @property {{name: string, rank: number}[]} tiers
 * @property {Map<string, {name: string, rank: number}>} tierByName
 * @property {string[]} personalNames - Non-tier root entries.
 * @property {Map<string, {rel: string, tier: object}>} index
 * @property {Map<string, string[]>} byBase - Resolution name to paths.
 * @property {object|null} registry - Parsed registry.yaml.
 * @property {Set<string>|null} typeVocab - Registry type values.
 * @property {Map<string, object>} tagRows - Registry tag rows by tag.
 * @property {(rel: string) => Promise<boolean>} exists
 */

const TIER_RE = /^[0-9]-/;
const NEAR_MISS_RE = /^[0-9]{2,3}-/;
const PERSONAL_DIGITS_RE = /^[0-9]{4,}-/;
const LEGACY_ROOTS = ["Knowledge", "Drafts"];
const LEGACY_ENTITIES = [
  "People",
  "Organizations",
  "Projects",
  "Topics",
  "Candidates",
  "Priorities",
  "Conditions",
  "Roles",
  "Prospects",
  "Erasure",
  "Tasks",
  "Goals",
];
const REGISTRY_FILE = "registry.yaml";
const BASELINE_FILE = "validation-baseline.json";
const CORE_KEYS = ["type", "created", "updated"];
const DATE_KEYS = ["created", "updated"];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ALIAS_TYPES = ["person", "candidate", "organization"];
const STATUS_TYPES = ["candidate", "prospect"];
const WIKI_LINK_RE = /!?\[\[([^[\]]+)\]\]/g;
const MD_LINK_RE = /!?\[[^\]]*\]\(([^)]+)\)/g;
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const INLINE_TAG_RE = /(?:^|[\s(])#([A-Za-z][\w-]*(?:\/[\w-]+)+)/g;

/** @param {string} raw - A wiki-link inner text. @returns {string} The bare target. */
function wikiTarget(raw) {
  return raw
    .split(/\\\||\|/)[0]
    .replace(/#.*$/, "")
    .trim();
}

/** @param {*} v @returns {boolean} True for a scalar frontmatter value. */
function isScalar(v) {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

/**
 * Split a note into its frontmatter block and body. The block only counts
 * when line 1 opens it.
 * @param {string[]} lines - The note's lines.
 * @returns {{blockLines: string[]|null, bodyStart: number}}
 */
function splitFrontmatter(lines) {
  if (lines[0] !== "---") return { blockLines: null, bodyStart: 0 };
  const end = lines.indexOf("---", 1);
  if (end === -1) return { blockLines: null, bodyStart: 0 };
  return { blockLines: lines.slice(1, end), bodyStart: end + 1 };
}

/**
 * Build the baseline key of a finding or a baseline entry. Vocabulary kinds
 * include the value; no key includes a line number, so edits elsewhere in a
 * note never resurface a grandfathered finding.
 * @param {object} f - A finding or a baseline entry.
 * @returns {string}
 */
function baselineKey(f) {
  if (f.path !== undefined) return ["d", f.kind, f.path].join(" ");
  if (f.property !== undefined) {
    const value = f.kind === "frontmatter-vocabulary" ? (f.value ?? "") : "";
    return ["p", f.kind, f.file, f.property, value].join(" ");
  }
  return ["l", f.kind, f.file, f.link].join(" ");
}

/**
 * Pass 1: read the root and collect tiers, near misses, and personal names.
 * @param {Ctx} ctx
 * @returns {Promise<string[]>} The sorted root entry names.
 */
async function collectTiers(ctx) {
  const rootNames = (
    await ctx.fs.readdir(ctx.kbRoot, { withFileTypes: true })
  ).map((d) => d.name);
  rootNames.sort();
  for (const name of rootNames) {
    const stat = await ctx.fs.stat(join(ctx.kbRoot, name)).catch(() => null);
    if (!stat?.isDirectory() || PERSONAL_DIGITS_RE.test(name)) {
      ctx.personalNames.push(name);
    } else if (NEAR_MISS_RE.test(name)) {
      ctx.findings.push({ kind: "out-of-grammar-rank", path: name });
    } else if (TIER_RE.test(name)) {
      const rank = Number(name[0]);
      const twin = ctx.tiers.find((t) => t.rank === rank);
      if (twin) {
        ctx.findings.push({
          kind: "duplicate-rank",
          path: name,
          message: `rank ${rank} is claimed by both ${twin.name}/ and ${name}/`,
        });
      }
      ctx.tiers.push({ name, rank });
    } else {
      ctx.personalNames.push(name);
    }
  }
  return rootNames;
}

/**
 * Pass 2: flag the legacy layout. `Knowledge/` and `Drafts/` fail at any
 * time; the historical entity directories fail only at a tier-less root;
 * a root with no tiers and no legacy markers fails no-tiers.
 * @param {Ctx} ctx
 * @param {string[]} rootNames
 * @returns {void}
 */
function detectLegacy(ctx, rootNames) {
  const markers = LEGACY_ROOTS.filter((name) => rootNames.includes(name));
  if (ctx.tiers.length === 0) {
    markers.push(...LEGACY_ENTITIES.filter((n) => rootNames.includes(n)));
  }
  for (const name of markers) {
    ctx.findings.push({
      kind: "legacy-layout",
      path: name,
      message: `legacy layout: ${name}/ at the KB root — see MIGRATION.md`,
    });
  }
  if (ctx.tiers.length === 0 && markers.length === 0) {
    ctx.findings.push({
      kind: "no-tiers",
      path: ".",
      message: "no tier directories at the KB root — see MIGRATION.md",
    });
  }
}

/**
 * Pass 3: index every file under the tiers (through symlinks), keyed by
 * root-relative path and by resolution name (basename without `.md`).
 * @param {Ctx} ctx
 * @param {string} relDir
 * @param {{name: string, rank: number}} tier
 * @returns {Promise<void>}
 */
async function walkTier(ctx, relDir, tier) {
  const names = (
    await ctx.fs.readdir(join(ctx.kbRoot, relDir), { withFileTypes: true })
  ).map((d) => d.name);
  names.sort();
  for (const name of names) {
    const rel = `${relDir}/${name}`;
    const stat = await ctx.fs.stat(join(ctx.kbRoot, rel));
    if (stat.isDirectory()) {
      await walkTier(ctx, rel, tier);
      continue;
    }
    ctx.index.set(rel, { rel, tier });
    const key = name.endsWith(".md") ? name.slice(0, -3) : name;
    if (!ctx.byBase.has(key)) ctx.byBase.set(key, []);
    ctx.byBase.get(key).push(rel);
  }
}

/**
 * Extract links from a frontmatter block. A property wiki link must be
 * double-quoted; an unquoted one is a serialization finding, not a link.
 * @param {Ctx} ctx
 * @param {{rel: string, tier: object}} note
 * @param {string[]} blockLines
 * @param {boolean} shared
 * @param {object[]} links
 * @returns {object|null} The parsed frontmatter, or null when unparseable.
 */
function extractFrontmatter(ctx, note, blockLines, shared, links) {
  let frontmatter = null;
  try {
    frontmatter = parseYaml(blockLines.join("\n")) ?? {};
  } catch {
    if (shared) {
      ctx.findings.push({
        kind: "frontmatter-invalid",
        file: note.rel,
        line: 1,
        property: "frontmatter",
        value: "unparseable YAML",
      });
    }
  }
  blockLines.forEach((raw, i) => {
    for (const match of raw.matchAll(WIKI_LINK_RE)) {
      const quoted =
        raw[match.index - 1] === '"' &&
        raw[match.index + match[0].length] === '"';
      if (quoted) {
        links.push({
          line: i + 2,
          target: wikiTarget(match[1]),
          fromFrontmatter: true,
        });
      } else if (shared) {
        ctx.findings.push({
          kind: "frontmatter-invalid",
          file: note.rel,
          line: i + 2,
          property: raw.split(":")[0].trim().replace(/^- /, ""),
          value: match[0],
        });
      }
    }
  });
  return frontmatter;
}

/**
 * Flag literal path strings that name a narrower tier or a personal surface.
 * @param {Ctx} ctx
 * @param {{rel: string, tier: object}} note
 * @param {string} stripped - The line with link spans blanked.
 * @param {number} lineNo
 * @returns {void}
 */
function scanPathStrings(ctx, note, stripped, lineNo) {
  const names = [...ctx.tiers.map((t) => t.name), ...ctx.personalNames];
  for (const name of names) {
    const at = stripped.indexOf(`${name}/`);
    if (at === -1) continue;
    if (at > 0 && /[\w[]/.test(stripped[at - 1])) continue;
    const tier = ctx.tierByName.get(name);
    if (tier && tier.rank >= note.tier.rank) continue;
    ctx.findings.push({
      kind: "path-string",
      file: note.rel,
      line: lineNo,
      link: stripped.slice(at).split(/[\s)\]"'`]/)[0],
      sourceTier: note.tier.name,
      targetTier: tier?.name ?? null,
    });
  }
}

/**
 * Extract body links, path strings, and inline tags. Fenced code blocks are
 * opaque.
 * @param {Ctx} ctx
 * @param {{rel: string, tier: object}} note
 * @param {string[]} lines
 * @param {number} bodyStart
 * @param {boolean} shared
 * @param {object[]} links
 * @returns {void}
 */
function extractBody(ctx, note, lines, bodyStart, shared, links) {
  let fenced = false;
  for (let i = bodyStart; i < lines.length; i++) {
    if (/^```/.test(lines[i].trim())) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const stripped = extractLineLinks(lines[i], i + 1, links);
    if (!shared) continue;
    scanPathStrings(ctx, note, stripped, i + 1);
    for (const match of stripped.matchAll(INLINE_TAG_RE)) {
      ctx.findings.push({
        kind: "frontmatter-invalid",
        file: note.rel,
        line: i + 1,
        property: "tags",
        value: `#${match[1]}`,
      });
    }
  }
}

/**
 * Extract the wiki and relative markdown links on one body line.
 * @param {string} line
 * @param {number} lineNo
 * @param {object[]} links - The accumulator.
 * @returns {string} The line with every link span blanked.
 */
function extractLineLinks(line, lineNo, links) {
  let stripped = line;
  for (const match of line.matchAll(WIKI_LINK_RE)) {
    links.push({ line: lineNo, target: wikiTarget(match[1]) });
    stripped = stripped.replace(match[0], " ".repeat(match[0].length));
  }
  for (const match of stripped.matchAll(MD_LINK_RE)) {
    const target = mdTarget(match[1]);
    if (target === null) continue;
    links.push({ line: lineNo, target, relative: true });
    stripped = stripped.replace(match[0], " ".repeat(match[0].length));
  }
  return stripped;
}

/**
 * Normalize a markdown link target. URLs with a scheme and pure anchors are
 * out of scope.
 * @param {string} raw
 * @returns {string|null}
 */
function mdTarget(raw) {
  const target = raw.split(/\s+/)[0];
  if (URL_SCHEME_RE.test(target) || target.startsWith("#")) return null;
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

/**
 * Whether a path-form target names something outside the tier set that
 * exists on disk (a personal surface).
 * @param {Ctx} ctx @param {string} target
 * @returns {Promise<boolean>}
 */
async function isPersonalTarget(ctx, target) {
  const first = target.split("/")[0];
  if (!target.includes("/") || ctx.tierByName.has(first)) return false;
  return (await ctx.exists(target)) || (await ctx.exists(`${target}.md`));
}

/**
 * Resolve a wiki target from the KB root, then by unique basename.
 * @param {Ctx} ctx @param {string} target
 * @returns {Promise<{rel: string}|{ambiguous: true}|{personal: true}|null>}
 */
async function resolveWikiTarget(ctx, target) {
  const hit = ctx.index.get(target) ?? ctx.index.get(`${target}.md`);
  if (hit) return { rel: hit.rel };
  if (await isPersonalTarget(ctx, target)) return { personal: true };
  const base = target.split("/").pop();
  const matches = ctx.byBase.get(base) ?? ctx.byBase.get(`${base}.md`) ?? [];
  if (matches.length === 1) return { rel: matches[0] };
  return matches.length > 1 ? { ambiguous: true } : null;
}

/**
 * Normalize a relative markdown target against the source directory.
 * @param {string} sourceRel @param {string} target
 * @returns {string} The KB-root-relative path, or "" when it escapes.
 */
function resolveRelative(sourceRel, target) {
  const parts = dirname(sourceRel).split("/");
  for (const seg of target.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return "";
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("/");
}

/**
 * Resolve one extracted link to an indexed path, pushing the resolution
 * finding when it fails.
 * @param {Ctx} ctx
 * @param {{rel: string, tier: object}} note
 * @param {object} link
 * @param {object} base - The shared finding fields.
 * @returns {Promise<string|null>} The resolved root-relative path.
 */
async function resolveLink(ctx, note, link, base) {
  if (!link.relative) {
    const hit = await resolveWikiTarget(ctx, link.target);
    if (hit?.rel) return hit.rel;
    if (hit?.personal) {
      ctx.findings.push({ kind: "narrower-link", ...base, targetTier: null });
    } else if (hit?.ambiguous) {
      ctx.findings.push({ kind: "ambiguous", ...base, targetTier: null });
    } else {
      ctx.findings.push({ kind: "unresolved", ...base, targetTier: null });
    }
    return null;
  }
  const rel = resolveRelative(note.rel, link.target);
  if (rel && ctx.index.has(rel)) return rel;
  const outside = rel && !ctx.tierByName.has(rel.split("/")[0]);
  const kind =
    outside && (await ctx.exists(rel)) ? "narrower-link" : "unresolved";
  ctx.findings.push({ kind, ...base, targetTier: null });
  return null;
}

/**
 * Apply the format contract to a resolved wiki link in a shared tier: the
 * link must be tier-prefixed and vault-absolute. Relative links inside one
 * entity subdirectory are exempt; frontmatter links are not.
 * @param {Ctx} ctx
 * @param {{rel: string, tier: object}} note
 * @param {object} link
 * @param {string} resolvedRel
 * @param {{name: string}} targetTier
 * @param {object} base - The shared finding fields.
 * @returns {void}
 */
function checkLinkFormat(ctx, note, link, resolvedRel, targetTier, base) {
  if (note.tier.rank < 1 || link.relative) return;
  if (link.target.split("/")[0] === targetTier.name) return;
  const sameEntityDir =
    !link.fromFrontmatter &&
    resolvedRel.split("/").length > 2 &&
    note.rel.split("/").slice(0, 2).join("/") ===
      resolvedRel.split("/").slice(0, 2).join("/");
  if (sameEntityDir) return;
  ctx.findings.push({
    kind: "bare-basename",
    ...base,
    targetTier: targetTier.name,
  });
}

/**
 * Passes 5–7 for one link: resolution, legality, format.
 * @param {Ctx} ctx
 * @param {{rel: string, tier: object}} note
 * @param {object} link
 * @returns {Promise<void>}
 */
async function checkLink(ctx, note, link) {
  const base = {
    file: note.rel,
    line: link.line,
    link: link.target,
    sourceTier: note.tier.name,
  };
  const resolvedRel = await resolveLink(ctx, note, link, base);
  if (resolvedRel === null) return;
  const targetTier = ctx.index.get(resolvedRel).tier;
  if (targetTier.rank < note.tier.rank) {
    ctx.findings.push({
      kind: "narrower-link",
      ...base,
      targetTier: targetTier.name,
    });
    return;
  }
  checkLinkFormat(ctx, note, link, resolvedRel, targetTier, base);
}

/**
 * Push one frontmatter finding.
 * @param {Ctx} ctx @param {string} kind @param {string} rel
 * @param {string} property @param {string|null} value
 * @returns {void}
 */
function fmFinding(ctx, kind, rel, property, value) {
  ctx.findings.push({ kind, file: rel, line: 1, property, value });
}

/**
 * Core keys and validator-decidable conditional triggers.
 * @param {Ctx} ctx @param {{rel: string, tier: object}} note @param {object} fm
 * @returns {void}
 */
function checkRequiredKeys(ctx, note, fm) {
  for (const key of CORE_KEYS) {
    if (fm[key] === undefined) {
      fmFinding(ctx, "frontmatter-missing", note.rel, key, null);
    }
  }
  if (ALIAS_TYPES.includes(fm.type) && fm.aliases === undefined) {
    fmFinding(ctx, "frontmatter-missing", note.rel, "aliases", null);
  }
  if (STATUS_TYPES.includes(fm.type) && fm.status === undefined) {
    fmFinding(ctx, "frontmatter-missing", note.rel, "status", null);
  }
  if (note.tier.rank === 4 && fm.verified === undefined) {
    fmFinding(ctx, "frontmatter-missing", note.rel, "verified", null);
  }
}

/**
 * Serialization contract: a flat block and ISO dates.
 * @param {Ctx} ctx @param {{rel: string}} note @param {object} fm
 * @returns {void}
 */
function checkSerialization(ctx, note, fm) {
  for (const [key, value] of Object.entries(fm)) {
    const flat =
      isScalar(value) || (Array.isArray(value) && value.every(isScalar));
    if (!flat) {
      fmFinding(ctx, "frontmatter-invalid", note.rel, key, String(value));
    }
  }
  for (const key of DATE_KEYS) {
    const value = fm[key];
    if (typeof value === "string" && !ISO_DATE_RE.test(value)) {
      fmFinding(ctx, "frontmatter-invalid", note.rel, key, value);
    }
  }
}

/**
 * Registry-dependent vocabulary checks: type, status, tags, and tag tier
 * bounds. Skipped entirely when no registry file is present.
 * @param {Ctx} ctx @param {{rel: string, tier: object}} note @param {object} fm
 * @returns {void}
 */
function checkVocabulary(ctx, note, fm) {
  if (typeof fm.type === "string" && !ctx.typeVocab.has(fm.type)) {
    fmFinding(ctx, "frontmatter-vocabulary", note.rel, "type", fm.type);
  }
  const statusVocab = ctx.registry.status?.[fm.type];
  if (statusVocab && fm.status !== undefined) {
    if (!statusVocab.includes(fm.status)) {
      fmFinding(
        ctx,
        "frontmatter-vocabulary",
        note.rel,
        "status",
        String(fm.status),
      );
    }
  }
  for (const tag of Array.isArray(fm.tags) ? fm.tags : []) {
    const row = ctx.tagRows.get(tag);
    if (!row || note.tier.rank > row.bound) {
      fmFinding(ctx, "frontmatter-vocabulary", note.rel, "tags", String(tag));
    }
  }
}

/**
 * Pass 8 for one shared-tier note.
 * @param {Ctx} ctx
 * @param {{rel: string, tier: object}} note
 * @param {object|null|undefined} fm - Parsed frontmatter; nullish means none.
 * @returns {void}
 */
function checkNoteFrontmatter(ctx, note, fm) {
  if (fm === null || fm === undefined) {
    for (const key of CORE_KEYS) {
      fmFinding(ctx, "frontmatter-missing", note.rel, key, null);
    }
    return;
  }
  checkRequiredKeys(ctx, note, fm);
  checkSerialization(ctx, note, fm);
  if (ctx.registry) checkVocabulary(ctx, note, fm);
}

/**
 * Overlay declarations: a cross-tier duplicate basename inside the same
 * entity-subdirectory name marks the narrower note as an overlay, and an
 * overlay declares itself through `canonical`.
 * @param {Ctx} ctx
 * @param {{rel: string, tier: object}[]} notes
 * @param {Map<string, object|null>} frontmatterByRel
 * @returns {void}
 */
function checkOverlays(ctx, notes, frontmatterByRel) {
  const families = new Map();
  for (const note of notes) {
    const segments = note.rel.split("/");
    if (note.tier.rank < 1 || segments.length < 3) continue;
    const key = `${segments[1]}/${segments[segments.length - 1]}`;
    if (!families.has(key)) families.set(key, []);
    families.get(key).push(note);
  }
  for (const family of families.values()) {
    const widest = Math.max(...family.map((n) => n.tier.rank));
    for (const note of family) {
      const fm = frontmatterByRel.get(note.rel);
      if (note.tier.rank < widest && fm?.canonical === undefined) {
        fmFinding(ctx, "overlay-undeclared", note.rel, "canonical", null);
      }
    }
  }
}

/**
 * Validate one knowledge base.
 * @param {string} kbRoot - Absolute path to the KB root (the vault).
 * @param {{fs: object}} runtime - Injected async fs surface.
 * @returns {Promise<{findings: Finding[], tierCount: number}>}
 */
export async function validateKnowledgeBase(kbRoot, runtime) {
  const { fs } = runtime;
  /** @type {Ctx} */
  const ctx = {
    fs,
    kbRoot,
    findings: [],
    tiers: [],
    tierByName: new Map(),
    personalNames: [],
    index: new Map(),
    byBase: new Map(),
    registry: null,
    typeVocab: null,
    tagRows: new Map(),
    exists: (rel) =>
      fs.access(join(kbRoot, rel)).then(
        () => true,
        () => false,
      ),
  };

  const rootNames = await collectTiers(ctx);
  ctx.tierByName = new Map(ctx.tiers.map((t) => [t.name, t]));
  detectLegacy(ctx, rootNames);
  for (const tier of ctx.tiers) await walkTier(ctx, tier.name, tier);
  await loadRegistry(ctx);
  await checkNotes(ctx);
  await applyBaseline(ctx);
  return { findings: ctx.findings, tierCount: ctx.tiers.length };
}

/**
 * Read the vault-local registry when present. Vocabulary checks stay off
 * without it, so recipient suffixes still validate.
 * @param {Ctx} ctx
 * @returns {Promise<void>}
 */
async function loadRegistry(ctx) {
  if (!(await ctx.exists(REGISTRY_FILE))) return;
  ctx.registry = parseYaml(
    await ctx.fs.readFile(join(ctx.kbRoot, REGISTRY_FILE), "utf8"),
  );
  ctx.typeVocab = new Set([
    ...Object.values(ctx.registry.types ?? {}),
    ...Object.values(ctx.registry.reserved ?? {}),
  ]);
  ctx.tagRows = new Map((ctx.registry.tags ?? []).map((r) => [r.tag, r]));
}

/**
 * Passes 4–8: extract, resolve, and check every indexed note.
 * @param {Ctx} ctx
 * @returns {Promise<void>}
 */
async function checkNotes(ctx) {
  const notes = [...ctx.index.values()].filter((f) => f.rel.endsWith(".md"));
  const frontmatterByRel = new Map();
  for (const note of notes) {
    const shared = note.tier.rank >= 1;
    const text = await ctx.fs.readFile(join(ctx.kbRoot, note.rel), "utf8");
    const lines = text.split("\n");
    const { blockLines, bodyStart } = splitFrontmatter(lines);
    const links = [];
    const fm = blockLines
      ? extractFrontmatter(ctx, note, blockLines, shared, links)
      : undefined;
    frontmatterByRel.set(note.rel, fm);
    extractBody(ctx, note, lines, bodyStart, shared, links);
    for (const link of links) await checkLink(ctx, note, link);
    if (shared) checkNoteFrontmatter(ctx, note, fm);
  }
  checkOverlays(ctx, notes, frontmatterByRel);
}

/**
 * Pass 9: mark findings the vault-local baseline grandfathers.
 * @param {Ctx} ctx
 * @returns {Promise<void>}
 */
async function applyBaseline(ctx) {
  const baseline = (await ctx.exists(BASELINE_FILE))
    ? JSON.parse(await ctx.fs.readFile(join(ctx.kbRoot, BASELINE_FILE), "utf8"))
    : null;
  const baselined = new Set((baseline?.findings ?? []).map(baselineKey));
  for (const finding of ctx.findings) {
    finding.baselined = baselined.has(baselineKey(finding));
  }
}
