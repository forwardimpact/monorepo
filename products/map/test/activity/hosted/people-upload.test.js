import { test, describe } from "node:test";
import assert from "node:assert";
import { handlePeopleUpload } from "../../../supabase/functions/people-upload/handler.js";
import { createHostedRuntime } from "../../../supabase/functions/_shared/runtime.ts";
import { createFakeSupabase } from "./fake-supabase.js";

const YAML = `- email: daedalus@bionova.example
  name: Daedalus
  discipline: data-engineering
  level: J080
`;

describe("hosted people-upload handler", () => {
  test("criterion 3: a people-upload round-trip does not throw for want of a clock", async () => {
    const fake = createFakeSupabase();

    const body = await handlePeopleUpload(
      fake,
      createHostedRuntime(),
      YAML,
      "yaml",
    );

    assert.strictEqual(body.stored, true);
    assert.match(body.path, /^people\/.*\.yaml$/);
    assert.strictEqual(body.imported, 1);
    assert.deepStrictEqual(body.errors, []);
  });
});
