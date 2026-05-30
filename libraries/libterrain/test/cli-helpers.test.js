import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { SummaryRenderer } from "@forwardimpact/libcli";
import { printCacheReport } from "../src/cli-helpers.js";

function makeFakeProcess() {
  const chunks = [];
  return {
    chunks,
    proc: {
      env: { LOG_LEVEL: "info" },
      stdout: { write: (s) => chunks.push(s) },
    },
  };
}

function renderCacheReport(stats, ok) {
  const { proc, chunks } = makeFakeProcess();
  const summary = new SummaryRenderer({ process: proc });
  // Pass proc.stdout directly — printCacheReport now accepts it as the fourth arg.
  printCacheReport({ stats: { prose: stats } }, summary, ok, proc.stdout);
  return chunks.join("");
}

describe("printCacheReport", () => {
  test("on cache miss, enumerates miss keys in stable sorted order before the summary", () => {
    const out = renderCacheReport(
      {
        hits: 2,
        generated: 0,
        misses: 3,
        missKeys: new Set(["zeta", "alpha", "mike"]),
      },
      false,
    );
    assert.match(out, /Cache misses \(3\)/);
    // Keys appear sorted, one per line.
    const alphaIdx = out.indexOf("alpha");
    const mikeIdx = out.indexOf("mike");
    const zetaIdx = out.indexOf("zeta");
    assert.ok(alphaIdx >= 0 && mikeIdx > alphaIdx && zetaIdx > mikeIdx);
    // The summary table follows the miss-key block.
    assert.ok(out.indexOf("Cache report") > zetaIdx);
  });

  test("on fully-hit run, the miss-key section is omitted", () => {
    const out = renderCacheReport(
      { hits: 5, generated: 0, misses: 0, missKeys: new Set() },
      true,
    );
    assert.doesNotMatch(out, /Cache misses/);
    assert.match(out, /Cache report/);
  });
});
