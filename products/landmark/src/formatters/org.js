/**
 * Formatters for the `org` command.
 */

import { padRight, renderHeader } from "./shared.js";

export function toText(view) {
  if (view.team) return teamToText(view);
  return orgToText(view);
}

export function toJson(view, meta) {
  return JSON.stringify({ ...view, meta }, null, 2);
}

export function toMarkdown(view) {
  if (view.team) return teamToMarkdown(view);
  return orgToMarkdown(view);
}

function orgToText({ people }) {
  const lines = [renderHeader("Organization directory"), ""];
  const nameWidth = Math.max(20, ...people.map((p) => (p.name ?? "").length));
  for (const p of people) {
    const name = padRight(p.name ?? "(unknown)", nameWidth);
    const role = [p.discipline, p.level, p.track].filter(Boolean).join(" / ");
    lines.push(`    ${name}  ${p.email}  ${role}`);
  }
  lines.push("");
  return lines.join("\n");
}

function teamToText({ team, managerEmail }) {
  const lines = [renderHeader(`Team under ${managerEmail}`), ""];
  const nameWidth = Math.max(20, ...team.map((p) => (p.name ?? "").length));
  for (const p of team) {
    const name = padRight(p.name ?? "(unknown)", nameWidth);
    const role = [p.discipline, p.level, p.track].filter(Boolean).join(" / ");
    const mgr = p.email === managerEmail ? " (manager)" : "";
    lines.push(`    ${name}  ${p.email}  ${role}${mgr}`);
  }
  lines.push("");
  return lines.join("\n");
}

function orgToMarkdown({ people }) {
  const lines = [
    "# Organization directory",
    "",
    "| Name | Email | Role |",
    "| --- | --- | --- |",
  ];
  for (const p of people) {
    const role = [p.discipline, p.level, p.track].filter(Boolean).join(" / ");
    lines.push(`| ${p.name ?? "(unknown)"} | ${p.email} | ${role} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function teamToMarkdown({ team, managerEmail }) {
  const lines = [
    `# Team under ${managerEmail}`,
    "",
    "| Name | Email | Role |",
    "| --- | --- | --- |",
  ];
  for (const p of team) {
    const role = [p.discipline, p.level, p.track].filter(Boolean).join(" / ");
    lines.push(`| ${p.name ?? "(unknown)"} | ${p.email} | ${role} |`);
  }
  lines.push("");
  return lines.join("\n");
}
