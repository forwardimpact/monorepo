import { test, describe } from "node:test";
import assert from "node:assert";

import { serverFlagsShortCircuit } from "../src/server-flags.js";

const NAME = "fit-svctest";
const DESCRIPTION = "Test service";
// The fake fsSync below ignores the path, so any valid URL works here.
const PACKAGE_JSON_URL = new URL("./package.json", import.meta.url);

// A fake fsSync that returns a package.json with a known version, so the
// version path is deterministic without depending on a real file.
const fakeFsSync = {
  readFileSync: () => JSON.stringify({ version: "1.2.3-fake" }),
};

function capture() {
  const writes = [];
  return {
    proc: { stdout: { write: (s) => writes.push(s) } },
    output: () => writes.join(""),
  };
}

function call(argv, extra = {}) {
  const cap = capture();
  const handled = serverFlagsShortCircuit({
    name: NAME,
    description: DESCRIPTION,
    packageJsonUrl: PACKAGE_JSON_URL,
    argv,
    proc: cap.proc,
    fsSync: fakeFsSync,
    ...extra,
  });
  return { handled, output: cap.output() };
}

describe("serverFlagsShortCircuit help tokens", () => {
  for (const token of ["--help", "-h"]) {
    test(`${token} returns true and writes a non-empty help block naming the binary`, () => {
      const { handled, output } = call([token]);
      assert.equal(handled, true);
      assert.ok(output.length > 0);
      assert.ok(output.includes(NAME));
      assert.ok(output.includes(DESCRIPTION));
    });
  }
});

describe("serverFlagsShortCircuit version tokens", () => {
  for (const token of ["--version", "-V"]) {
    test(`${token} returns true and writes the resolved version from fsSync`, () => {
      const { handled, output } = call([token]);
      assert.equal(handled, true);
      assert.equal(output, "1.2.3-fake\n");
    });

    test(`${token} prefers the LIBCLI_PACKAGE_VERSION override`, () => {
      const prev = process.env.LIBCLI_PACKAGE_VERSION;
      process.env.LIBCLI_PACKAGE_VERSION = "9.9.9-override";
      try {
        const { handled, output } = call([token]);
        assert.equal(handled, true);
        assert.equal(output, "9.9.9-override\n");
      } finally {
        if (prev === undefined) delete process.env.LIBCLI_PACKAGE_VERSION;
        else process.env.LIBCLI_PACKAGE_VERSION = prev;
      }
    });
  }
});

describe("serverFlagsShortCircuit non-token first argument", () => {
  for (const argv of [
    ["--port", "8080"],
    ["8080"],
    [],
    ["start", "--help"],
    ["--help=1"],
  ]) {
    test(`${JSON.stringify(argv)} returns false and writes nothing`, () => {
      const { handled, output } = call(argv);
      assert.equal(handled, false);
      assert.equal(output, "");
    });
  }
});
