/**
 * Formatters for the `initiative` command.
 */

import { formatDelta, padRight, renderHeader } from "./shared.js";

export function toText(view) {
  if (view.initiatives) return listToText(view);
  if (view.initiative) return showToText(view);
  if (view.impacts) return impactToText(view);
  return "";
}

export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

export function toMarkdown(view) {
  if (view.initiatives) return listToMarkdown(view);
  if (view.initiative) return showToMarkdown(view);
  if (view.impacts) return impactToMarkdown(view);
  return "";
}

function listToText({ initiatives }) {
  const lines = [renderHeader("Initiatives"), ""];
  const nameWidth = Math.max(
    20,
    ...initiatives.map((i) => (i.name ?? "").length),
  );

  for (const init of initiatives) {
    const name = padRight(init.name ?? "(unnamed)", nameWidth);
    const pct = init.completion_pct != null ? `${init.completion_pct}%` : "n/a";
    const status = init.completed_at ? "completed" : "active";
    lines.push(
      `    ${name}  ${padRight(pct, 6)}  ${status}  ${init.due_date ?? ""}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

function showToText({ initiative }) {
  const init = initiative;
  const lines = [renderHeader(`Initiative: ${init.name}`), ""];
  lines.push(`    ID:          ${init.id}`);
  lines.push(`    Description: ${init.description ?? "(none)"}`);
  lines.push(`    Owner:       ${init.owner_email ?? "(none)"}`);
  lines.push(`    Due date:    ${init.due_date ?? "(none)"}`);
  lines.push(`    Priority:    ${init.priority ?? "(none)"}`);
  lines.push(`    Scorecard:   ${init.scorecard_id ?? "(none)"}`);
  const pct = init.completion_pct != null ? `${init.completion_pct}%` : "n/a";
  lines.push(
    `    Completion:  ${pct} (${init.passed_checks ?? 0}/${init.total_checks ?? 0} checks)`,
  );
  lines.push(`    Status:      ${init.completed_at ? "completed" : "active"}`);
  lines.push("");
  return lines.join("\n");
}

function impactToText({ impacts }) {
  const lines = [
    renderHeader("Completed initiatives — outcome correlation"),
    "",
  ];

  for (const item of impacts) {
    const init = item.initiative;
    lines.push(
      `    "${init.name}" (completed ${init.completed_at ?? "unknown"})`,
    );

    const driver = item.driverName ?? init.scorecard_id;
    if (driver) {
      lines.push(`      Target driver: ${driver}`);
    } else {
      lines.push("      Target driver: (no driver linked)");
    }

    if (item.before != null) {
      lines.push(`      Score before: ${item.before}`);
      lines.push(`      Score after:  ${item.after}`);
      lines.push(`      Change: ${formatDelta(item.delta)} percentile points`);
    } else {
      lines.push("      Score before: n/a");
      lines.push("      Score after:  n/a");
      lines.push("      Change: n/a");
    }
    lines.push("");
  }

  return lines.join("\n");
}

function listToMarkdown({ initiatives }) {
  const lines = [
    "# Initiatives",
    "",
    "| Name | Completion | Status | Due Date |",
    "| --- | --- | --- | --- |",
  ];
  for (const init of initiatives) {
    const pct = init.completion_pct != null ? `${init.completion_pct}%` : "n/a";
    const status = init.completed_at ? "completed" : "active";
    lines.push(
      `| ${init.name} | ${pct} | ${status} | ${init.due_date ?? ""} |`,
    );
  }
  return lines.join("\n");
}

function showToMarkdown({ initiative }) {
  const init = initiative;
  return [
    `# Initiative: ${init.name}`,
    "",
    `- **ID:** ${init.id}`,
    `- **Owner:** ${init.owner_email ?? "(none)"}`,
    `- **Due:** ${init.due_date ?? "(none)"}`,
    `- **Completion:** ${init.completion_pct ?? "n/a"}% (${init.passed_checks ?? 0}/${init.total_checks ?? 0})`,
    `- **Status:** ${init.completed_at ? "completed" : "active"}`,
  ].join("\n");
}

function impactToMarkdown({ impacts }) {
  const lines = ["# Initiative Impact", ""];
  for (const item of impacts) {
    const init = item.initiative;
    lines.push(`## ${init.name}`);
    lines.push(`Completed: ${init.completed_at ?? "unknown"}`);
    if (item.driverName) {
      lines.push(`Target driver: ${item.driverName}`);
    }
    if (item.delta != null) {
      lines.push(
        `Change: **${formatDelta(item.delta)}** percentile points (${item.before} → ${item.after})`,
      );
    } else {
      lines.push("Change: n/a");
    }
    lines.push("");
  }
  return lines.join("\n");
}
