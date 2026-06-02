/**
 * Formatters for the `voice` command.
 */

import { renderHeader, truncateSnippet } from "./shared.js";

/** Render voice comments as plain text, dispatching to email or manager format. */
export function toText(view) {
  if (view.mode === "email") return emailToText(view);
  return managerToText(view);
}

/** Serialize the voice view and metadata as formatted JSON. */
export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

/** Render voice comments as markdown, dispatching to email or manager format. */
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
        .map((s) => `"${truncateSnippet(s)}"`)
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
      const snippets = t.snippets
        .map((s) => `"${truncateSnippet(s)}"`)
        .join(", ");
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
