import { describe, test } from "node:test";
import assert from "node:assert";

import {
  updateEnvFile,
  readEnvFile,
  getOrGenerateSecret,
  parseDuration,
} from "../src/index.js";
import { TEST_ENV_PATH, makeRuntime } from "./libsecret-helpers.js";

describe("libsecret — duration parser and env-file persistence", () => {
  describe("parseDuration", () => {
    test("parses hours", () => {
      assert.strictEqual(parseDuration("1h"), 3600);
      assert.strictEqual(parseDuration("24h"), 86400);
    });

    test("parses days", () => {
      assert.strictEqual(parseDuration("1d"), 86400);
      assert.strictEqual(parseDuration("365d"), 31536000);
    });

    test("parses years", () => {
      assert.strictEqual(parseDuration("1y"), 31536000);
      assert.strictEqual(parseDuration("2y"), 63072000);
    });

    test("rejects bare numbers", () => {
      assert.throws(() => parseDuration("60"), /invalid duration/);
    });

    test("rejects an unknown suffix", () => {
      assert.throws(() => parseDuration("5m"), /invalid duration/);
    });

    test("rejects an empty string", () => {
      assert.throws(() => parseDuration(""), /invalid duration/);
    });
  });

  describe("updateEnvFile", () => {
    test("creates a new .env file when it does not exist", async () => {
      const runtime = makeRuntime();
      await updateEnvFile("TEST_KEY", "test-value", TEST_ENV_PATH, runtime);

      const content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(content.includes("TEST_KEY=test-value"));
    });

    test("adds a new key to an existing .env file", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "EXISTING_KEY=existing-value\n",
      });
      await updateEnvFile("NEW_KEY", "new-value", TEST_ENV_PATH, runtime);

      const content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(content.includes("EXISTING_KEY=existing-value"));
      assert.ok(content.includes("NEW_KEY=new-value"));
    });

    test("updates an existing key in the .env file", async () => {
      const runtime = makeRuntime({ [TEST_ENV_PATH]: "MY_KEY=old-value\n" });
      await updateEnvFile("MY_KEY", "new-value", TEST_ENV_PATH, runtime);

      const content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(content.includes("MY_KEY=new-value"));
      assert.ok(!content.includes("old-value"));
    });

    test("uncomments and updates a commented key", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "# TEST_KEY=commented-value\n",
      });
      await updateEnvFile("TEST_KEY", "new-value", TEST_ENV_PATH, runtime);

      const content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.strictEqual(content.trim(), "TEST_KEY=new-value");
    });

    test("handles a file without a trailing newline", async () => {
      const runtime = makeRuntime({ [TEST_ENV_PATH]: "FIRST_KEY=value" });
      await updateEnvFile("SECOND_KEY", "second-value", TEST_ENV_PATH, runtime);

      const content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(content.includes("FIRST_KEY=value"));
      assert.ok(content.includes("SECOND_KEY=second-value"));
    });

    test("the output always ends with a trailing newline", async () => {
      const runtime = makeRuntime();
      await updateEnvFile("KEY_A", "value-a", TEST_ENV_PATH, runtime);
      let content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(content.endsWith("\n"), "a new file should end with a newline");

      await updateEnvFile("KEY_B", "value-b", TEST_ENV_PATH, runtime);
      content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(
        content.endsWith("\n"),
        "a file with an appended key should end with a newline",
      );

      await updateEnvFile("KEY_A", "updated", TEST_ENV_PATH, runtime);
      content = await runtime.fs.readFile(TEST_ENV_PATH, "utf8");
      assert.ok(
        content.endsWith("\n"),
        "a file with an updated key should end with a newline",
      );
    });

    test("uses the provided env path", async () => {
      const customPath = "/test/custom.env";
      const runtime = makeRuntime();
      await updateEnvFile("KEY", "value", customPath, runtime);

      const content = await runtime.fs.readFile(customPath, "utf8");
      assert.ok(content.includes("KEY=value"));
    });

    test("calls chmod(path, 0o600) on a new file", async () => {
      const runtime = makeRuntime();
      await updateEnvFile("SECRET", "s3cret", TEST_ENV_PATH, runtime);

      assert.strictEqual(runtime.fs.chmod.mock.callCount(), 1);
      assert.strictEqual(
        runtime.fs.chmod.mock.calls[0].arguments[0],
        TEST_ENV_PATH,
      );
      assert.strictEqual(runtime.fs.chmod.mock.calls[0].arguments[1], 0o600);
    });

    test("calls chmod(path, 0o600) on an update", async () => {
      const runtime = makeRuntime({ [TEST_ENV_PATH]: "PRIOR=value\n" });
      await updateEnvFile("PRIOR", "updated", TEST_ENV_PATH, runtime);

      assert.strictEqual(runtime.fs.chmod.mock.callCount(), 1);
      assert.strictEqual(runtime.fs.chmod.mock.calls[0].arguments[1], 0o600);
    });
  });

  describe("readEnvFile", () => {
    test("returns undefined when the file does not exist", async () => {
      const runtime = makeRuntime();
      const value = await readEnvFile("MISSING_KEY", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, undefined);
    });

    test("returns undefined when the key does not exist", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "OTHER_KEY=other-value\n",
      });
      const value = await readEnvFile("MISSING_KEY", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, undefined);
    });

    test("returns the value for an existing key", async () => {
      const runtime = makeRuntime({ [TEST_ENV_PATH]: "MY_KEY=my-value\n" });
      const value = await readEnvFile("MY_KEY", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, "my-value");
    });

    test("returns a value that contains an equals sign", async () => {
      const runtime = makeRuntime({ [TEST_ENV_PATH]: "JWT_TOKEN=abc=def==\n" });
      const value = await readEnvFile("JWT_TOKEN", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, "abc=def==");
    });

    test("ignores commented keys", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "# MY_KEY=commented-value\n",
      });
      const value = await readEnvFile("MY_KEY", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, undefined);
    });

    test("returns the first match when duplicates exist", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "MY_KEY=first-value\nMY_KEY=second-value\n",
      });
      const value = await readEnvFile("MY_KEY", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, "first-value");
    });

    test("handles an empty value", async () => {
      const runtime = makeRuntime({ [TEST_ENV_PATH]: "EMPTY_KEY=\n" });
      const value = await readEnvFile("EMPTY_KEY", TEST_ENV_PATH, runtime);
      assert.strictEqual(value, "");
    });
  });

  describe("getOrGenerateSecret", () => {
    test("returns the existing value when the key exists", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "MY_SECRET=existing-secret\n",
      });
      const generator = () => "new-secret";
      const value = await getOrGenerateSecret(
        "MY_SECRET",
        generator,
        TEST_ENV_PATH,
        runtime,
      );
      assert.strictEqual(value, "existing-secret");
    });

    test("calls the generator when the key does not exist", async () => {
      const runtime = makeRuntime();
      const generator = () => "generated-secret";
      const value = await getOrGenerateSecret(
        "MY_SECRET",
        generator,
        TEST_ENV_PATH,
        runtime,
      );
      assert.strictEqual(value, "generated-secret");
    });

    test("does not call the generator when the key exists", async () => {
      const runtime = makeRuntime({
        [TEST_ENV_PATH]: "MY_SECRET=existing-secret\n",
      });
      let generatorCalled = false;
      const generator = () => {
        generatorCalled = true;
        return "new-secret";
      };
      await getOrGenerateSecret("MY_SECRET", generator, TEST_ENV_PATH, runtime);
      assert.strictEqual(generatorCalled, false);
    });

    test("calls the generator when the file does not exist", async () => {
      const runtime = makeRuntime();
      const generator = () => "generated-secret";
      const value = await getOrGenerateSecret(
        "MY_SECRET",
        generator,
        TEST_ENV_PATH,
        runtime,
      );
      assert.strictEqual(value, "generated-secret");
    });

    test("throws when the generator is not a function", async () => {
      const runtime = makeRuntime();
      await assert.rejects(
        async () =>
          getOrGenerateSecret(
            "MY_SECRET",
            "not-a-function",
            TEST_ENV_PATH,
            runtime,
          ),
        { message: "generator is required" },
      );
    });

    test("does not write to the file (no side effects)", async () => {
      const runtime = makeRuntime();
      const generator = () => "generated-secret";
      await getOrGenerateSecret("MY_SECRET", generator, TEST_ENV_PATH, runtime);

      // The code never calls writeFile
      assert.strictEqual(runtime.fs.writeFile.mock.callCount(), 0);
    });
  });
});
