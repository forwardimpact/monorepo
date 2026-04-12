/**
 * Formatters for the `health` command.
 */

import { formatDelta, renderHeader } from "./shared.js";

export function toText(view) {
  const lines = [renderHeader(`${view.teamLabel} — health view`), ""];

  for (const driver of view.drivers) {
    const scorePart =
      driver.score != null ? `${driver.score}th percentile` : "n/a";
    const orgPart =
      driver.vs_org != null ? `vs_org: ${formatDelta(driver.vs_org)}` : "";
    lines.push(
      `    Driver: ${driver.name} (${scorePart}${orgPart ? ", " + orgPart : ""})`,
    );

    const skillNames = driver.contributingSkills
      .map((s) => s.skillId)
      .join(", ");
    lines.push(`      Contributing skills: ${skillNames}`);

    const evidenceParts = driver.contributingSkills.map(
      (s) => `${s.count} artifacts for ${s.skillId}`,
    );
    lines.push(`      Evidence: ${evidenceParts.join(", ")}`);

    // <comments section> — Part 04 renders per-driver comments here
    if (driver.comments && driver.comments.length > 0) {
      const snippets = driver.comments.slice(0, 2).map((c) => `"${c.text}"`);
      lines.push(
        `      GetDX comments: ${snippets.join("\n                      ")}`,
      );
    }

    // Recommendations from Summit
    if (driver.recommendations && driver.recommendations.length > 0) {
      for (const rec of driver.recommendations) {
        const candidates = rec.candidates
          .slice(0, 2)
          .map((c) => `${c.name ?? c.email} (${c.currentLevel})`)
          .join(" or ");
        lines.push("");
        lines.push(
          `      ⮕ Recommendation: ${candidates} could develop ${rec.skill}.`,
        );
        lines.push(`        (Summit growth alignment: ${rec.impact})`);
      }
    }

    // <initiatives section> — Part 05 renders per-driver initiatives here
    if (driver.initiatives && driver.initiatives.length > 0) {
      lines.push("");
      lines.push("      Active initiatives:");
      for (const init of driver.initiatives.slice(0, 3)) {
        const pct =
          init.completion_pct != null ? `${init.completion_pct}%` : "n/a";
        lines.push(`        - ${init.name} (${pct} complete)`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

export function toMarkdown(view) {
  const lines = [`# ${view.teamLabel} — health view`, ""];

  for (const driver of view.drivers) {
    const scorePart =
      driver.score != null ? `${driver.score}th percentile` : "n/a";
    lines.push(`## Driver: ${driver.name} (${scorePart})`);
    lines.push("");

    const skillNames = driver.contributingSkills
      .map((s) => s.skillId)
      .join(", ");
    lines.push(`**Contributing skills:** ${skillNames}`);

    const evidenceParts = driver.contributingSkills.map(
      (s) => `${s.count} artifacts for ${s.skillId}`,
    );
    lines.push(`**Evidence:** ${evidenceParts.join(", ")}`);

    if (driver.comments && driver.comments.length > 0) {
      lines.push("");
      lines.push("**GetDX comments:**");
      for (const c of driver.comments.slice(0, 2)) {
        lines.push(`> ${c.text}`);
      }
    }

    if (driver.recommendations && driver.recommendations.length > 0) {
      lines.push("");
      for (const rec of driver.recommendations) {
        const candidates = rec.candidates
          .slice(0, 2)
          .map((c) => `${c.name ?? c.email} (${c.currentLevel})`)
          .join(" or ");
        lines.push(
          `> **Recommendation:** ${candidates} could develop ${rec.skill}. (${rec.impact})`,
        );
      }
    }

    if (driver.initiatives && driver.initiatives.length > 0) {
      lines.push("");
      lines.push("**Active initiatives:**");
      for (const init of driver.initiatives.slice(0, 3)) {
        const pct =
          init.completion_pct != null ? `${init.completion_pct}%` : "n/a";
        lines.push(`- ${init.name} (${pct} complete)`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}
