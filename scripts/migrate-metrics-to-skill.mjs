#!/usr/bin/env node
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readdirSync,
  existsSync,
} from "node:fs";
import path from "node:path";

// This one-shot ran against the pre-spec-1540 six-column schema; the
// header is frozen locally so the script's record of what it did stays
// accurate as the live schema evolves.
const EXPECTED_HEADER = "date,metric,value,unit,run,note";

const WIKI_METRICS = path.resolve("wiki/metrics");

const MAPPING = {
  "product-manager/backlog": "kata-product-issue",
  "product-manager/evaluation": "kata-interview",
  "release-engineer/merge": "kata-release-merge",
  "release-engineer/release": "kata-release-cut",
  "security-engineer/audit": "kata-security-audit",
  "security-engineer/triage": "kata-security-update",
  "staff-engineer/implementation": "kata-implement",
  "staff-engineer/spec": "kata-spec",
  "staff-engineer/trace": "kata-trace",
  "technical-writer/documentation": "kata-documentation",
  "technical-writer/wiki": "kata-wiki-curate",
};

const skillRows = {};

for (const [source, skill] of Object.entries(MAPPING)) {
  const sourceDir = path.join(WIKI_METRICS, source);
  const csvFiles = readdirSync(sourceDir).filter((f) => f.endsWith(".csv"));

  for (const csvFile of csvFiles) {
    const csvPath = path.join(sourceDir, csvFile);
    const content = readFileSync(csvPath, "utf-8")
      .replace(/\r\n/g, "\n")
      .trim();
    const lines = content.split("\n");
    const header = lines[0];
    if (header !== EXPECTED_HEADER) {
      console.error(`unexpected header in ${csvPath}: ${header}`);
      process.exit(1);
    }

    const dataRows = lines.slice(1);
    const year = csvFile.replace(".csv", "");
    const key = `${skill}/${year}`;

    if (!skillRows[key])
      skillRows[key] = { skill, year, rows: [], sources: [] };
    skillRows[key].rows.push(...dataRows);
    skillRows[key].sources.push(`${source}/${csvFile}`);
  }
}

let totalSourceRows = 0;
let totalOutputRows = 0;

for (const { skill, year, rows, sources } of Object.values(skillRows)) {
  rows.sort((a, b) => {
    const dateA = a.split(",")[0];
    const dateB = b.split(",")[0];
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const metricA = a.split(",")[1];
    const metricB = b.split(",")[1];
    return metricA.localeCompare(metricB);
  });

  const targetDir = path.join(WIKI_METRICS, skill);
  mkdirSync(targetDir, { recursive: true });
  const targetPath = path.join(targetDir, `${year}.csv`);
  writeFileSync(targetPath, EXPECTED_HEADER + "\n" + rows.join("\n") + "\n");

  totalSourceRows += rows.length;
  totalOutputRows += rows.length;
  console.log(`${skill}: ${rows.length} rows from ${sources.join(", ")}`);
}

if (totalSourceRows !== totalOutputRows) {
  console.error(
    `ROW COUNT MISMATCH: source=${totalSourceRows} output=${totalOutputRows}`,
  );
  process.exit(1);
}

for (const source of Object.keys(MAPPING)) {
  const sourceDir = path.join(WIKI_METRICS, source);
  const csvFiles = readdirSync(sourceDir).filter((f) => f.endsWith(".csv"));
  for (const csvFile of csvFiles) {
    rmSync(path.join(sourceDir, csvFile));
  }

  const remaining = readdirSync(sourceDir);
  if (remaining.length === 0) {
    rmSync(sourceDir, { recursive: true });
    const agentDir = path.dirname(sourceDir);
    if (existsSync(agentDir) && readdirSync(agentDir).length === 0) {
      rmSync(agentDir, { recursive: true });
    }
  }
}

console.log(`\nMigration complete: ${totalOutputRows} total rows preserved.`);
