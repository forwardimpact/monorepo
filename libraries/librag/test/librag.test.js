import { test, describe } from "node:test";
import assert from "node:assert";

import { formatQueryLine } from "../src/commands/query.js";
import { formatSubjectLine } from "../src/commands/subjects.js";
import { formatSearchLine } from "../src/commands/search.js";

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
