import { test, describe } from "node:test";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

// Dispatch smoke test: both bins list their subcommands in help and reject an
// unknown subcommand with exit 2 (spec criterion 3 — the two bins exist and
// dispatch). Spawns the real bins, so this is the one whole-file integration
// smoke per binary.
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
