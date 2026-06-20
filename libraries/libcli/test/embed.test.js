import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { join } from "node:path";

import {
  registerAssets,
  resetEmbeddedAssets,
  embeddedAssetsActive,
  embeddedDir,
  withEmbeddedAssets,
  LIBCLI_IS_COMPILED,
} from "../src/embed.js";

// The registry is module-global and shared across the whole `bun test` process.
// Reset before each test so this file neither leaks the active flag into later
// test files nor lets one test's mounts bleed into the next — the no-op-when-
// unregistered assertion below depends on starting from a clean registry.
describe("embed", () => {
  beforeEach(() => {
    resetEmbeddedAssets();
  });

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

  test("LIBCLI_IS_COMPILED is a boolean, false outside a compiled binary", () => {
    // The constant folds to true only when build/build-binary.sh injects
    // `--define process.env.LIBCLI_IS_COMPILED="1"`; in source/test execution
    // the env var is unset, so it must be a plain false.
    assert.strictEqual(typeof LIBCLI_IS_COMPILED, "boolean");
    assert.strictEqual(LIBCLI_IS_COMPILED, false);
  });

  test("overlay is a no-op when no assets are registered", () => {
    // With an empty registry (the beforeEach reset guarantees this), the overlay
    // returns the runtime unchanged so source/npx execution keeps its on-disk fs.
    const base = {
      fsSync: { existsSync: () => false, readFileSync: () => "" },
    };
    assert.strictEqual(withEmbeddedAssets(base), base);
  });

  test("overlay wraps into a distinct frozen runtime once a mount is registered", () => {
    registerAssets("test/frozen", { "a.md": "embedded" });
    const base = {
      fsSync: { existsSync: () => false, readFileSync: () => "" },
    };
    const wrapped = withEmbeddedAssets(base);
    assert.notStrictEqual(wrapped, base);
    assert.ok(Object.isFrozen(wrapped));
  });
});
