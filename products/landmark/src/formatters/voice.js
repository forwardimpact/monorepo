/**
 * Formatters for the `voice` command.
 */

import { renderHeader } from "./shared.js";

export function toText(view) {
  if (view.mode === "email") return emailToText(view);
  return managerToText(view);
}

export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

export function toMarkdown(view) {
  if (view.mode === "email") return emailToMarkdown(view);
  return managerToMarkdown(view);
}

function emailToText(view) {
  const lines = [renderHeader(`${view.email}'s snapshot comments`), ""];

  for (const c of view.comments) {
    lines.push(`    ${c.snapshotDate}: "${c.text}"`);
  }
  lines.push("");

  if (view.evidenceContext.length > 0) {
    lines.push("    Context from evidence:");
    for (const e of view.evidenceContext) {
      lines.push(`      ${e.skillId}: ${e.matched} matched evidence rows`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function managerToText(view) {
  const lines = [
    renderHeader(`${view.managerEmail} team — engineer voice`),
    "",
  ];

  if (view.themes.length > 0) {
    lines.push("    Most discussed themes:");
    for (const t of view.themes) {
      const snippetPreview = t.snippets
        .slice(0, 2)
        .map((s) => `"${s.slice(0, 60)}"`)
        .join(", ");
      lines.push(
        `      ${t.theme.padEnd(20)}  ${t.count} comments   ${snippetPreview}`,
      );
    }
    lines.push("");
  }

  if (view.healthAlignment.length > 0) {
    lines.push("    Aligned with health signals:");
    for (const h of view.healthAlignment) {
      lines.push(`      ${h.driverName} driver (${h.percentile}th pctl)`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function emailToMarkdown(view) {
  const lines = [`# ${view.email}'s snapshot comments`, ""];

  for (const c of view.comments) {
    lines.push(`- **${c.snapshotDate}:** "${c.text}"`);
  }
  lines.push("");

  if (view.evidenceContext.length > 0) {
    lines.push("## Context from evidence");
    for (const e of view.evidenceContext) {
      lines.push(`- ${e.skillId}: ${e.matched} matched evidence rows`);
    }
  }

  return lines.join("\n");
}

function managerToMarkdown(view) {
  const lines = [`# ${view.managerEmail} team — engineer voice`, ""];

  if (view.themes.length > 0) {
    lines.push("## Most discussed themes");
    lines.push("");
    lines.push("| Theme | Comments | Snippets |");
    lines.push("| --- | --- | --- |");
    for (const t of view.themes) {
      const snippets = t.snippets.map((s) => `"${s.slice(0, 60)}"`).join(", ");
      lines.push(`| ${t.theme} | ${t.count} | ${snippets} |`);
    }
    lines.push("");
  }

  if (view.healthAlignment.length > 0) {
    lines.push("## Aligned with health signals");
    for (const h of view.healthAlignment) {
      lines.push(`- ${h.driverName} driver (${h.percentile}th pctl)`);
    }
  }

  return lines.join("\n");
}
