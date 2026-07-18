import { test, describe } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { formatQueryLine } from "../src/commands/query.js";
import { formatSubjectLine } from "../src/commands/subjects.js";
import { formatSearchLine } from "../src/commands/search.js";

const processBin = fileURLToPath(
  new URL("../bin/fit-process.js", import.meta.url),
);
const ragBin = fileURLToPath(new URL("../bin/fit-rag.js", import.meta.url));

/**
 * Run a bin with node and return its stdout, or throw the child error (which
 * carries `.status` for the exit code).
 * @param {string} bin
 * @param {string[]} args
 * @returns {string}
 */
function runBin(bin, args) {
  return execFileSync("node", [bin, ...args], { encoding: "utf8" });
}

// Byte-parity: each read subcommand reproduces its predecessor's exact stdout
// format (spec criterion 2). The formatter is the byte contract; the pipeline
// that feeds it (index construction, embedding service) is exercised by the
// live spot-run in the plan's step 10.
describe("read-command stdout format parity", () => {
  test("fit-rag query prints the bare identifier", () => {
    const id = { toString: () => "cld:common.Person/alice" };
    assert.strictEqual(formatQueryLine(id), "cld:common.Person/alice");
    assert.strictEqual(formatQueryLine("plain-id"), "plain-id");
  });

  test("fit-rag subjects prints subject<TAB>type", () => {
    assert.strictEqual(
      formatSubjectLine("schema:Person", "rdfs:Class"),
      "schema:Person\trdfs:Class",
    );
  });

  test("fit-rag search prints identifier<TAB>score to four decimals", () => {
    const scored = { toString: () => "cld:common.Doc/1", score: 0.5 };
    assert.strictEqual(formatSearchLine(scored), "cld:common.Doc/1\t0.5000");

    const unscored = { toString: () => "cld:common.Doc/2" };
    assert.strictEqual(formatSearchLine(unscored), "cld:common.Doc/2\t");
  });
});

// Dispatch: both bins list their subcommands in help and reject an unknown
// subcommand with exit 2 (spec criterion 3 — the two bins exist and dispatch).
describe("bin dispatch", () => {
  test("fit-process --help lists its write subcommands", () => {
    const out = runBin(processBin, ["--help"]);
    for (const sub of ["resources", "graphs", "vectors"]) {
      assert.ok(out.includes(sub), `help should list "${sub}"`);
    }
  });

  test("fit-rag --help lists its read subcommands", () => {
    const out = runBin(ragBin, ["--help"]);
    for (const sub of ["search", "query", "subjects"]) {
      assert.ok(out.includes(sub), `help should list "${sub}"`);
    }
  });

  test("fit-process rejects an unknown subcommand with exit 2", () => {
    assert.throws(
      () => runBin(processBin, ["bogus"]),
      (err) => err.status === 2,
    );
  });

  test("fit-rag rejects an unknown subcommand with exit 2", () => {
    assert.throws(
      () => runBin(ragBin, ["bogus"]),
      (err) => err.status === 2,
    );
  });
});
