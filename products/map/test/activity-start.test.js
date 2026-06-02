/**
 * Unit test for activity.start()'s output. Stubs supabaseCli + stdout
 * via the DI parameters; asserts the new one-line ready confirmation.
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
  test("prints a single ready confirmation with the API_URL", async () => {
    const cli = fakeCli({ API_URL: "http://127.0.0.1:54321" });
    const out = fakeStdout();
    const rc = await start({ cli, out });
    assert.equal(rc, 0);
    assert.match(out.text, /Supabase ready at http:\/\/127\.0\.0\.1:54321/);
  });
});
