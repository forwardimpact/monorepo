/**
 * The contract-view migration is map's implementation of the Substrate
 * Contract. This test parses the migration SQL and compares it against
 * `libterrain`'s `SUBSTRATE_CONTRACT` — never a hand-copied column list —
 * so map's views and the library's probe cannot drift apart. It then runs
 * the real `substrate check` probe against a stub built from the
 * migration's own column lists.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUBSTRATE_CONTRACT,
  runSubstrateCheck,
} from "@forwardimpact/libterrain/substrate";

const MIGRATION = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../supabase/migrations/20260708000000_substrate_contract.sql",
);

/**
 * Extract the output column names of `create view substrate.<name>` from
 * the migration source: the top-level select list of the view body, taking
 * `as <alias>` when present, else the bare column name after the last dot.
 */
function viewColumns(sql, name) {
  const viewRe = new RegExp(
    `create view substrate\\.${name} as\\s+([\\s\\S]*?);`,
    "i",
  );
  const match = sql.match(viewRe);
  if (!match) return null;
  let body = match[1];
  // For a WITH ... SELECT body, the output list is the first top-level
  // select after the CTE closes; strip the CTE block first.
  if (/^\s*with\s/i.test(body)) {
    body = body.slice(body.indexOf(")") + 1);
  }
  const selectRe = /select\s+([\s\S]*?)\s+from\s/i;
  const select = body.match(selectRe);
  if (!select) return null;
  return splitTopLevel(select[1]).map((expr) => {
    const alias = expr.match(/\s+as\s+(\w+)\s*$/i);
    if (alias) return alias[1];
    const bare = expr.trim();
    return bare.includes(".") ? bare.split(".").pop() : bare;
  });
}

/** Split a select list on commas not nested inside parentheses. */
function splitTopLevel(list) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

describe("substrate contract views", () => {
  test("migration defines every contract relation with every contract column", async () => {
    const sql = await fs.readFile(MIGRATION, "utf8");
    for (const [name, rel] of Object.entries(SUBSTRATE_CONTRACT.relations)) {
      const columns = viewColumns(sql, name);
      assert.ok(columns, `migration defines no view substrate.${name}`);
      for (const col of rel.columns) {
        assert.ok(
          columns.includes(col),
          `substrate.${name} misses contract column ${col} (has: ${columns.join(", ")})`,
        );
      }
    }
  });

  test("migration exposes substrate through the Supabase API schemas", async () => {
    const configToml = await fs.readFile(
      path.join(path.dirname(MIGRATION), "../config.toml"),
      "utf8",
    );
    assert.match(configToml, /schemas = \[.*"substrate".*\]/);
  });

  test("grants stay service_role-only", async () => {
    const sql = await fs.readFile(MIGRATION, "utf8");
    assert.doesNotMatch(sql, /grant .*to .*(anon|authenticated)/i);
    assert.match(
      sql,
      /grant select on all tables in schema substrate to service_role/i,
    );
  });

  test("fit-terrain substrate check passes against the migration's column lists", async () => {
    const sql = await fs.readFile(MIGRATION, "utf8");
    const columnsByRelation = {};
    for (const name of Object.keys(SUBSTRATE_CONTRACT.relations)) {
      columnsByRelation[name] = viewColumns(sql, name) ?? [];
    }

    // Probe stub: answers a column-explicit select only when every requested
    // column exists in the migration-defined view.
    const supabase = {
      from(table) {
        return {
          select(columnList) {
            const available = columnsByRelation[table] ?? [];
            const missing = columnList
              .split(",")
              .filter((c) => !available.includes(c));
            return {
              limit: () =>
                Promise.resolve(
                  missing.length
                    ? {
                        data: null,
                        error: {
                          code: "42703",
                          message: `column ${table}.${missing[0]} does not exist`,
                        },
                      }
                    : { data: [], error: null },
                ),
            };
          },
        };
      },
    };

    const chunks = [];
    const runtime = {
      proc: {
        stdout: { write: (c) => chunks.push(c) },
        stderr: { write: (c) => chunks.push(c) },
      },
    };
    const code = await runSubstrateCheck({ supabase, runtime });
    assert.equal(code, 0, `check failed:\n${chunks.join("")}`);
  });
});
