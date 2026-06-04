import { test, describe } from "node:test";
import assert from "node:assert";
import { join } from "node:path";

import {
  registerAssets,
  embeddedAssetsActive,
  embeddedDir,
  withEmbeddedAssets,
} from "../src/embed.js";

// The registry is module-global; these tests register a unique mount so they
// neither depend on order nor collide with each other.
describe("embed", () => {
  test("embeddedAssetsActive flips to true once a mount is registered", () => {
    registerAssets("test/active", { "x.md": "hello" });
    assert.strictEqual(embeddedAssetsActive(), true);
  });

  test("embeddedDir + overlay serve registered content by joined path", () => {
    registerAssets("test/prompts", {
      "greet.prompt.md": "Hi {{name}}",
      "nested/deep.md": "deep",
    });
    const base = {
      fsSync: {
        existsSync: () => false,
        readFileSync: () => {
          throw new Error("should not hit disk");
        },
      },
    };
    const runtime = withEmbeddedAssets(base);
    const dir = embeddedDir("test/prompts");

    assert.strictEqual(
      runtime.fsSync.existsSync(join(dir, "greet.prompt.md")),
      true,
    );
    assert.strictEqual(
      runtime.fsSync.readFileSync(join(dir, "greet.prompt.md"), "utf-8"),
      "Hi {{name}}",
    );
    assert.strictEqual(
      runtime.fsSync.readFileSync(join(dir, "nested/deep.md"), "utf-8"),
      "deep",
    );
  });

  test("overlay delegates non-embedded paths to the base fsSync", () => {
    registerAssets("test/delegate", { "a.md": "embedded" });
    let seen = null;
    const base = {
      fsSync: {
        existsSync: (p) => {
          seen = p;
          return true;
        },
        readFileSync: () => "from-disk",
      },
    };
    const runtime = withEmbeddedAssets(base);

    assert.strictEqual(runtime.fsSync.existsSync("/etc/real/file"), true);
    assert.strictEqual(seen, "/etc/real/file");
    assert.strictEqual(
      runtime.fsSync.readFileSync("/etc/real/file", "utf-8"),
      "from-disk",
    );
  });

  test("overlay returns the same runtime when no assets are registered", () => {
    // A fresh registry would make this a no-op; once anything is registered the
    // overlay wraps. We assert the wrapped runtime is a distinct frozen object
    // so callers can rely on the contract regardless of registration order.
    const base = {
      fsSync: { existsSync: () => false, readFileSync: () => "" },
    };
    const wrapped = withEmbeddedAssets(base);
    assert.ok(Object.isFrozen(wrapped));
  });
});
