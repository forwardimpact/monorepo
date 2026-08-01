#!/usr/bin/env node
// A one-off audit. It is independent of the service-url-drift gate's
// assertion code. It reads each service's manifest-produced URL. It then
// tabulates every registered consumer's restated value against that URL. It
// shares only the expected-url AST helper with the gate. It owns its own
// consumer reader and table emit. It never calls the rules.
//
// Usage: node scripts/audit-service-urls.mjs
// Always exits 0. It reports. It does not gate.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

import {
  expectedUrl,
  urlsEqual,
} from "../.jidoka/invariants/service-url-drift.url.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = ".jidoka/invariants/service-url-drift.registry.yml";

function valueRe(service) {
  const key = `SERVICE_${service.toUpperCase()}_URL`;
  return new RegExp(`${key}[=:][ \\t]*"?((?:grpc|http)://[^"'\\s,]+)`);
}

// This line-scanner is independent of rgMatches. It finds each consumer's
// restated URL.
function restated(root, service, consumer) {
  const text = readFileSync(resolve(root, consumer.path), "utf8");
  const re =
    consumer.kind === "docs" ? new RegExp(consumer.pattern) : valueRe(service);
  const rows = [];
  text.split("\n").forEach((line, i) => {
    const m = line.match(re);
    if (m) rows.push({ lineNo: i + 1, value: (m[1] ?? m[0]).trim() });
  });
  return rows;
}

const registry = parseYaml(readFileSync(resolve(ROOT, REGISTRY), "utf8"));
const table = [];
let mismatches = 0;

for (const [service, entry] of Object.entries(registry.services ?? {})) {
  const expected = expectedUrl(ROOT, entry.manifest, service);
  for (const consumer of entry.consumers ?? []) {
    for (const row of restated(ROOT, service, consumer)) {
      const ok = urlsEqual(row.value, expected, service);
      if (!ok) mismatches += 1;
      table.push({
        service,
        path: `${consumer.path}:${row.lineNo}`,
        restated: row.value,
        expected,
        ok,
      });
    }
  }
}

const pad = (s, n) => String(s).padEnd(n);
process.stdout.write(
  `${pad("service", 12)}${pad("path", 60)}${pad("restated", 28)}${pad("expected", 28)}ok\n`,
);
for (const r of table) {
  process.stdout.write(
    `${pad(r.service, 12)}${pad(r.path, 60)}${pad(r.restated, 28)}${pad(r.expected, 28)}${r.ok ? "✓" : "✗"}\n`,
  );
}
process.stdout.write(`\n${mismatches} mismatch(es)\n`);
