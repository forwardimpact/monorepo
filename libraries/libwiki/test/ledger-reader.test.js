import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createMockGhClient } from "@forwardimpact/libmock";
import { readAnchors } from "../src/ledger/reader.js";
import { renderAnchorBody } from "../src/ledger/anchor.js";

function comment(id, anchor, createdAt = "2026-06-17T00:00:00Z") {
  return { id, created_at: createdAt, body: renderAnchorBody(anchor) };
}

describe("ledger reader", () => {
  test("reads anchors across paginated pages in id order", async () => {
    // The mock value is the already-flattened array a correct --slurp parse
    // yields; comments arrive out of id order to prove the sort.
    const gh = createMockGhClient({
      responses: {
        apiGetPaginated: [
          comment(300, { kind: "occ", ids: ["#98"], event: "bbb" }),
          { id: 250, created_at: "x", body: "not an anchor" },
          comment(100, { kind: "occ", ids: ["#97"], event: "aaa" }),
        ],
      },
    });
    const anchors = await readAnchors(gh, { owner: "o", repo: "r" });
    assert.deepEqual(
      anchors.map((a) => a.id),
      [100, 300],
    );
    assert.deepEqual(anchors[0].anchor.ids, ["#97"]);
    assert.deepEqual(anchors[1].anchor.ids, ["#98"]);
  });

  test("requests the configured owner/repo/issue comments path", async () => {
    const gh = createMockGhClient({ responses: { apiGetPaginated: [] } });
    await readAnchors(gh, { owner: "forwardimpact", repo: "monorepo" });
    assert.equal(
      gh.calls.at(-1).args[0],
      "repos/forwardimpact/monorepo/issues/1564/comments",
    );
  });

  test("throws without owner/repo", async () => {
    const gh = createMockGhClient();
    await assert.rejects(
      () => readAnchors(gh, {}),
      /owner and repo are required/,
    );
  });
});
