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

// The registry is module-global. The whole `bun test` process shares it.
// Reset before each test. Without the reset, this file leaks the active flag
// into later test files. One test's mounts also bleed into the next. The
// no-op-when-unregistered assertion below needs a clean registry.
describe("embed", () => {
  beforeEach(() => {
    resetEmbeddedAssets();
  });

  test("embeddedAssetsActive flips to true after registerAssets adds a mount", () => {
    registerAssets("test/active", { "x.md": "hello" });
    assert.strictEqual(embeddedAssetsActive(), true);
  });

  test("embeddedDir and the overlay serve registered content by the joined path", () => {
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

  test("the overlay delegates non-embedded paths to the base fsSync", () => {
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

  test("LIBCLI_IS_COMPILED is a boolean. It is false outside a compiled binary", () => {
    // The constant folds to true only when build/build-binary.sh injects
    // `--define process.env.LIBCLI_IS_COMPILED="1"`. In source runs and test
    // runs the env var is unset, so it must be a plain false.
    assert.strictEqual(typeof LIBCLI_IS_COMPILED, "boolean");
    assert.strictEqual(LIBCLI_IS_COMPILED, false);
  });

  test("the overlay is a no-op when the registry is empty", () => {
    // The beforeEach reset guarantees an empty registry. With an empty
    // registry, the overlay returns the runtime unchanged. Runs from source
    // and runs from npx keep their on-disk fs.
    const base = {
      fsSync: { existsSync: () => false, readFileSync: () => "" },
    };
    assert.strictEqual(withEmbeddedAssets(base), base);
  });

  test("the overlay wraps into a distinct frozen runtime after registerAssets adds a mount", () => {
    registerAssets("test/frozen", { "a.md": "embedded" });
    const base = {
      fsSync: { existsSync: () => false, readFileSync: () => "" },
    };
    const wrapped = withEmbeddedAssets(base);
    assert.notStrictEqual(wrapped, base);
    assert.ok(Object.isFrozen(wrapped));
  });
});
