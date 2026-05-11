/**
 * Unit test for activity.start()'s export-block printing.
 *
 * Stubs supabaseCli + stdout via the DI parameters added in step 1 of
 * spec 840; asserts the four MAP_SUPABASE_* exports are printed in the
 * documented order.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { start } from "../src/commands/activity.js";

function fakeCli(status) {
  return {
    run: async () => 0,
    capture: async () => JSON.stringify(status),
  };
}

function fakeStdout() {
  const chunks = [];
  return {
    chunks,
    write(s) {
      chunks.push(s);
    },
    get text() {
      return chunks.join("");
    },
  };
}

describe("activity.start()", () => {
  test("prints all four MAP_SUPABASE_* exports in the documented order", async () => {
    const cli = fakeCli({
      api_url: "http://127.0.0.1:54321",
      service_role_key: "service-key-xyz",
      anon_key: "anon-key-abc",
      jwt_secret: "jwt-secret-123",
    });
    const out = fakeStdout();
    const rc = await start({ cli, out });
    assert.equal(rc, 0);
    const text = out.text;
    assert.match(text, /export MAP_SUPABASE_URL=http:\/\/127\.0\.0\.1:54321/);
    assert.match(text, /export MAP_SUPABASE_SERVICE_ROLE_KEY=service-key-xyz/);
    assert.match(text, /export MAP_SUPABASE_ANON_KEY=anon-key-abc/);
    assert.match(text, /export MAP_SUPABASE_JWT_SECRET=jwt-secret-123/);
    // Order check — URL → SERVICE_ROLE_KEY → ANON_KEY → JWT_SECRET.
    const idxUrl = text.indexOf("MAP_SUPABASE_URL");
    const idxSvc = text.indexOf("MAP_SUPABASE_SERVICE_ROLE_KEY");
    const idxAnon = text.indexOf("MAP_SUPABASE_ANON_KEY");
    const idxJwt = text.indexOf("MAP_SUPABASE_JWT_SECRET");
    assert.ok(
      idxUrl < idxSvc && idxSvc < idxAnon && idxAnon < idxJwt,
      `wrong order: URL=${idxUrl} SVC=${idxSvc} ANON=${idxAnon} JWT=${idxJwt}`,
    );
  });
});
