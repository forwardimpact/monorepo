/**
 * `substrate init` scaffolds one timestamped starter migration under the
 * target checkout, generated from SUBSTRATE_CONTRACT so scaffold and probe
 * cannot drift.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createTestRuntime } from "@forwardimpact/libmock";

import { runSubstrateInit } from "../src/commands/substrate-init.js";
import { SUBSTRATE_CONTRACT } from "../src/substrate/contract.js";

describe("substrate init", () => {
  test("writes a timestamped migration under <cwd>/supabase/migrations", async () => {
    const runtime = createTestRuntime();
    const code = await runSubstrateInit({ cwd: "/proj", runtime });
    assert.equal(code, 0);

    const paths = [...runtime.fs.data.keys()];
    const migration = paths.find((p) =>
      /^\/proj\/supabase\/migrations\/\d{14}_substrate_contract\.sql$/.test(p),
    );
    assert.ok(migration, `no migration in ${paths.join(", ")}`);

    const sql = runtime.fs.data.get(migration);
    assert.match(sql, /create schema substrate;/);
    assert.match(sql, /grant usage on schema substrate to service_role;/);
    // One commented example view per contract relation, naming every column.
    for (const [name, rel] of Object.entries(SUBSTRATE_CONTRACT.relations)) {
      assert.match(sql, new RegExp(`-- create view substrate\\.${name} as`));
      for (const col of rel.columns) {
        assert.ok(sql.includes(`as ${col}`), `missing column ${col}`);
      }
    }
  });

  test("defaults to the process cwd", async () => {
    const runtime = createTestRuntime();
    const code = await runSubstrateInit({ runtime });
    assert.equal(code, 0);
    const cwd = runtime.proc.cwd();
    const paths = [...runtime.fs.data.keys()];
    assert.ok(paths.some((p) => p.startsWith(`${cwd}/supabase/migrations/`)));
  });
});
