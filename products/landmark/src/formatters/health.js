/**
 * Formatters for the `health` command.
 */

import {
  formatDelta,
  ordinalSuffix,
  padRight,
  renderHeader,
} from "./shared.js";

// ---------------------------------------------------------------------------
// Shared driver-section helpers (module-private)
// ---------------------------------------------------------------------------

function formatScorePart(driver) {
  return driver.score != null
    ? `${driver.score}${ordinalSuffix(driver.score)} percentile`
    : "n/a";
}

function formatSkillNames(driver) {
  return driver.contributingSkills.map((s) => s.skillId).join(", ");
}

function formatEvidenceParts(driver) {
  return driver.contributingSkills
    .map((s) => `${s.count} artifacts for ${s.skillId}`)
    .join(", ");
}

function recordDedupedCandidate(byKey, driver, rec, candidate) {
  const key = `${candidate.email}::${rec.skill}`;
  const existing = byKey.get(key);
  if (existing) {
    if (!existing.driverNames.includes(driver.name)) {
      existing.driverNames.push(driver.name);
    }
    return;
  }
  byKey.set(key, {
    candidate,
    skill: rec.skill,
    impact: rec.impact,
    driverNames: [driver.name],
  });
}

/**
 * Walk drivers → recommendations → candidates and emit one DedupedRec per
 * (candidate.email, rec.skill). Later occurrences extend driverNames; impact
 * is taken from the first occurrence.
 *
 * @param {Array} drivers
 * @returns {Array<{candidate: object, skill: string, impact: string,
 *   driverNames: string[]}>}
 */
function dedupeRecommendations(drivers) {
  const byKey = new Map();
  for (const driver of drivers) {
    for (const rec of driver.recommendations ?? []) {
      for (const candidate of rec.candidates ?? []) {
        recordDedupedCandidate(byKey, driver, rec, candidate);
      }
    }
  }
  return [...byKey.values()];
}

/**
 * Count non-null hidden anchors (vs_prev, vs_50th, vs_75th, vs_90th).
 * vs_org is the displayed anchor and is not counted.
 *
 * @param {object} driver
 * @returns {number}
 */
function countHiddenAnchors(driver) {
  let n = 0;
  for (const key of ["vs_prev", "vs_50th", "vs_75th", "vs_90th"]) {
    if (driver[key] != null) n += 1;
  }
  return n;
}

/**
 * Default-mode "Percentile" cell — ordinal only (e.g. "42nd"), without the
 * "percentile" word. The column header already labels the dimension.
 *
 * @param {object} driver
 * @returns {string}
 */
function formatPercentileCell(driver) {
  return driver.score != null
    ? `${driver.score}${ordinalSuffix(driver.score)}`
    : "n/a";
}

/**
 * Score cells for a driver row. Default mode returns the table tuple; verbose
 * mode returns a list of formatted anchor lines for the per-driver paragraph.
 *
 * @param {object} driver
 * @param {boolean} verbose
 * @returns {{percentile: string, vsOrg: string, more: string} | string[]}
 */
function renderScoreCells(driver, verbose) {
  if (verbose) {
    const lines = [];
    if (driver.vs_prev != null)
      lines.push(`vs_prev: ${formatDelta(driver.vs_prev)}`);
    if (driver.vs_org != null)
      lines.push(`vs_org: ${formatDelta(driver.vs_org)}`);
    if (driver.vs_50th != null)
      lines.push(`vs_50th: ${formatDelta(driver.vs_50th)}`);
    if (driver.vs_75th != null)
      lines.push(`vs_75th: ${formatDelta(driver.vs_75th)}`);
    if (driver.vs_90th != null)
      lines.push(`vs_90th: ${formatDelta(driver.vs_90th)}`);
    return lines;
  }
  const hidden = countHiddenAnchors(driver);
  return {
    percentile: formatPercentileCell(driver),
    vsOrg: driver.vs_org != null ? formatDelta(driver.vs_org) : "n/a",
    more: hidden > 0 ? `+${hidden} anchors via --verbose` : "-",
  };
}

// ---------------------------------------------------------------------------
// Text: per-driver section renderers (verbose mode)
// ---------------------------------------------------------------------------

function renderTextComments(driver, lines) {
  if (!driver.comments || driver.comments.length === 0) return;
  const snippets = driver.comments.slice(0, 2).map((c) => `"${c.text}"`);
  lines.push(
    `      GetDX comments: ${snippets.join("\n                      ")}`,
  );
}

function renderTextRecommendations(driver, lines, deduped) {
  const mine = deduped.filter((d) => d.driverNames[0] === driver.name);
  if (mine.length === 0) return;
  for (const rec of mine) {
    lines.push("");
    const candidate = rec.candidate;
    const phrase = `${candidate.name ?? candidate.email} (${candidate.currentLevel})`;
    lines.push(`      ⮕ Recommendation: ${phrase} could develop ${rec.skill}.`);
    lines.push(`        (Summit growth alignment: ${rec.impact})`);
  }
}

function renderTextDriver(driver, lines, deduped) {
  const anchorLines = renderScoreCells(driver, true);
  lines.push(`    Driver: ${driver.name} (${formatScorePart(driver)})`);
  if (anchorLines.length > 0) {
    lines.push(`      Anchors: ${anchorLines.join(", ")}`);
  }
  if (driver.contributingSkills.length > 0) {
    lines.push(`      Contributing skills: ${formatSkillNames(driver)}`);
    lines.push(`      Evidence: ${formatEvidenceParts(driver)}`);
  }

  renderTextComments(driver, lines);
  renderTextRecommendations(driver, lines, deduped);

  lines.push("");
}

// ---------------------------------------------------------------------------
// Markdown: per-driver section renderers (verbose mode)
// ---------------------------------------------------------------------------

function renderMdComments(driver, lines) {
  if (!driver.comments || driver.comments.length === 0) return;
  lines.push("");
  lines.push("**GetDX comments:**");
  for (const c of driver.comments.slice(0, 2)) {
    lines.push(`> ${c.text}`);
  }
}

function renderMdRecommendations(driver, lines, deduped) {
  const mine = deduped.filter((d) => d.driverNames[0] === driver.name);
  if (mine.length === 0) return;
  lines.push("");
  for (const rec of mine) {
    const candidate = rec.candidate;
    const phrase = `**${candidate.name ?? candidate.email}** (${candidate.currentLevel})`;
    lines.push(
      `> **Recommendation:** ${phrase} could develop \`${rec.skill}\`. (${rec.impact})`,
    );
  }
}

function renderMdDriver(driver, lines, deduped) {
  lines.push(`## Driver: ${driver.name} (${formatScorePart(driver)})`);
  lines.push("");
  const anchorLines = renderScoreCells(driver, true);
  if (anchorLines.length > 0) {
    lines.push(`**Anchors:** ${anchorLines.join(", ")}`);
    lines.push("");
  }

  if (driver.contributingSkills.length > 0) {
    lines.push(`**Contributing skills:** ${formatSkillNames(driver)}`);
    lines.push(`**Evidence:** ${formatEvidenceParts(driver)}`);
  }

  renderMdComments(driver, lines);
  renderMdRecommendations(driver, lines, deduped);

  lines.push("");
}

// ---------------------------------------------------------------------------
// Default mode: compact table + Recommendations trailer
// ---------------------------------------------------------------------------

const TEXT_COLS = { num: 3, driver: 16, percentile: 12, vsOrg: 9 };

function renderTextDefault(view, deduped, lines) {
  lines.push(`  Drivers (${view.drivers.length})`);
  lines.push("  " + "─".repeat(60));
  lines.push(
    "  " +
      padRight("#", TEXT_COLS.num) +
      padRight("Driver", TEXT_COLS.driver) +
      padRight("Percentile", TEXT_COLS.percentile) +
      padRight("vs_org", TEXT_COLS.vsOrg) +
      "More",
  );
  view.drivers.forEach((driver, i) => {
    const cells = renderScoreCells(driver, false);
    lines.push(
      "  " +
        padRight(String(i + 1), TEXT_COLS.num) +
        padRight(driver.name, TEXT_COLS.driver) +
        padRight(cells.percentile, TEXT_COLS.percentile) +
        padRight(cells.vsOrg, TEXT_COLS.vsOrg) +
        cells.more,
    );
  });
  if (deduped.length === 0) return;
  lines.push("");
  lines.push(`  Recommendations (${deduped.length} unique)`);
  lines.push("  " + "─".repeat(60));
  for (const rec of deduped) {
    const name = rec.candidate.name ?? rec.candidate.email;
    const drivers = rec.driverNames.join(", ");
    lines.push(
      `  - ${name} (${rec.candidate.currentLevel}) could develop ${rec.skill}` +
        ` — for ${drivers} (${rec.impact})`,
    );
  }
}

function renderMdDefault(view, deduped, lines) {
  lines.push(`## Drivers (${view.drivers.length})`);
  lines.push("");
  lines.push("| # | Driver | Percentile | vs_org | More |");
  lines.push("| --- | --- | --- | --- | --- |");
  view.drivers.forEach((driver, i) => {
    const cells = renderScoreCells(driver, false);
    const more =
      cells.more === "-" ? "-" : cells.more.replace("--verbose", "`--verbose`");
    lines.push(
      `| ${i + 1} | ${driver.name} | ${cells.percentile} | ${cells.vsOrg} | ${more} |`,
    );
  });
  if (deduped.length === 0) return;
  lines.push("");
  lines.push(`## Recommendations (${deduped.length} unique)`);
  lines.push("");
  for (const rec of deduped) {
    const name = rec.candidate.name ?? rec.candidate.email;
    const drivers = rec.driverNames.join(", ");
    lines.push(
      `- **${name}** (${rec.candidate.currentLevel}) could develop \`${rec.skill}\`` +
        ` — for ${drivers} (${rec.impact})`,
    );
  }
}

// ---------------------------------------------------------------------------
// Join-state copy — observable distinction between (a) no drivers configured
// and (b) configured but disjoint from snapshot ids.
// ---------------------------------------------------------------------------

function noDriversText() {
  return [
    "  Drivers (no drivers configured)",
    "  `data/pathway/drivers.yaml` is empty. Run `npx fit-map init` to",
    "  seed the 16-driver starter, then re-run.",
  ];
}

function noMatchText(driverJoin) {
  const { scoreIds, yamlIds } = driverJoin;
  return [
    "  Drivers (no matches)",
    `  Snapshot has ${scoreIds} driver ids, your \`data/pathway/drivers.yaml\` declares ${yamlIds}; none overlap.`,
    "  Edit `data/pathway/drivers.yaml` to align with the GetDX taxonomy",
    "  (`npx fit-map init` resets it).",
  ];
}

function noDriversMarkdown() {
  return [
    "## Drivers (no drivers configured)",
    "",
    "`data/pathway/drivers.yaml` is empty. Run `npx fit-map init` to seed the 16-driver starter, then re-run.",
  ];
}

function noMatchMarkdown(driverJoin) {
  const { scoreIds, yamlIds } = driverJoin;
  return [
    "## Drivers (no matches)",
    "",
    `Snapshot has ${scoreIds} driver ids, your \`data/pathway/drivers.yaml\` declares ${yamlIds}; none overlap.`,
    "",
    "Edit `data/pathway/drivers.yaml` to align with the GetDX taxonomy (`npx fit-map init` resets it).",
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Render the health view as indented plain text. Default mode emits a compact
 * table plus a deduped Recommendations trailer; verbose mode emits the
 * per-driver paragraph layout with all anchors disclosed. */
export function toText(view, meta) {
  const lines = [renderHeader(`${view.teamLabel} — health view`), ""];
  if (view.driverJoin?.state === "NO_DRIVERS") {
    lines.push(...noDriversText());
    return lines.join("\n");
  }
  if (view.driverJoin?.state === "NO_MATCH") {
    lines.push(...noMatchText(view.driverJoin));
    return lines.join("\n");
  }
  const deduped = dedupeRecommendations(view.drivers);
  if (meta?.verbose) {
    for (const driver of view.drivers) {
      renderTextDriver(driver, lines, deduped);
    }
  } else {
    renderTextDefault(view, deduped, lines);
  }
  return lines.join("\n");
}

/** Serialize the health view and metadata as formatted JSON. */
export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

/** Render the health view as markdown. Default mode emits a compact driver
 * table plus a deduped Recommendations trailer; verbose mode emits the
 * per-driver section layout with all anchors disclosed. */
export function toMarkdown(view, meta) {
  const lines = [`# ${view.teamLabel} — health view`, ""];
  if (view.driverJoin?.state === "NO_DRIVERS") {
    lines.push(...noDriversMarkdown());
    return lines.join("\n");
  }
  if (view.driverJoin?.state === "NO_MATCH") {
    lines.push(...noMatchMarkdown(view.driverJoin));
    return lines.join("\n");
  }
  const deduped = dedupeRecommendations(view.drivers);
  if (meta?.verbose) {
    for (const driver of view.drivers) {
      renderMdDriver(driver, lines, deduped);
    }
  } else {
    renderMdDefault(view, deduped, lines);
  }
  return lines.join("\n");
}
