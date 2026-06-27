/**
 * KBManager.kbPathForName — resolve a KB name to a data-home path, validating
 * (not sanitising) the name as a safe single segment.
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import { homedir } from "node:os";
import { join } from "node:path";
import { KBManager } from "../src/kb-manager.js";

const DATA_HOME = join(homedir(), ".local/share/fit/outpost");

describe("KBManager.kbPathForName", () => {
  test("resolves a name under the data home", () => {
    assert.strictEqual(
      KBManager.kbPathForName("team"),
      join(DATA_HOME, "team"),
    );
  });

  test("the default name team resolves under the data home", () => {
    // The dispatch layer defaults an absent name to `team`; the resolved
    // path must sit under the non-TCC data home.
    assert.ok(KBManager.kbPathForName("team").startsWith(DATA_HOME + "/"));
  });

  test("a second named KB resolves beside the first", () => {
    assert.strictEqual(
      KBManager.kbPathForName("personal"),
      join(DATA_HOME, "personal"),
    );
  });

  for (const unsafe of ["a/b", "a\\b", "..", "../escape", "x\0y", "~evil"]) {
    test(`rejects unsafe name ${JSON.stringify(unsafe)}`, () => {
      assert.throws(() => KBManager.kbPathForName(unsafe), /unsafe KB name/);
    });
  }

  test("rejects an empty name", () => {
    assert.throws(() => KBManager.kbPathForName(""), /unsafe KB name/);
  });

  test("rejects a non-string name", () => {
    assert.throws(() => KBManager.kbPathForName(undefined), /unsafe KB name/);
    assert.throws(() => KBManager.kbPathForName(42), /unsafe KB name/);
  });
});
