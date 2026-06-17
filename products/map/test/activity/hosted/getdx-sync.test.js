import { test, describe, afterEach } from "node:test";
import assert from "node:assert";
import { handleGetDXSync } from "../../../supabase/functions/getdx-sync/handler.js";
import { createHostedRuntime } from "../../../supabase/functions/_shared/runtime.ts";
import { createFakeSupabase } from "./fake-supabase.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stub fetch so extractGetDX never hits the network. */
function stubFetch(payload = {}) {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    async json() {
      return payload;
    },
  });
}

describe("hosted getdx-sync handler", () => {
  test("criterion 3: extract + snapshot-comment clock paths complete without throwing", async () => {
    stubFetch({ teams: [], snapshots: [] });

    // Seed a stored snapshot-comments file so the transform reaches its clock read.
    const fake = createFakeSupabase({
      storage: {
        "getdx/snapshots-comments/": [{ name: "snap-1.json" }],
      },
      files: {
        "getdx/snapshots-comments/snap-1.json": JSON.stringify({
          comments: [{ email: "daedalus@bionova.example", text: "nice" }],
        }),
      },
    });

    const body = await handleGetDXSync(fake, createHostedRuntime(), {
      apiToken: "t",
      baseUrl: "https://api.getdx.example",
    });

    // The clock-dependent extract and transform ran; no TypeError thrown.
    assert.ok("ok" in body);
    assert.ok(Array.isArray(body.extract.files));
    assert.ok("errors" in body.transform);
  });
});
