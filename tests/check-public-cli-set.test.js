/**
 * Pure-core tests for the public-CLI-set invariant
 * (.coaligned/invariants/public-cli-set.rules.mjs): the launcher set must
 * equal the rule's output (invoked names ∩ non-private bins), every launcher
 * must hold the canonical byte-exact shape and placeholders, and nothing
 * beyond the allowed manifest surface may ride into a published launcher.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  canonicalBinContent,
  checkPublicCliSet,
  computePublicCliSet,
} from "../.coaligned/invariants/public-cli-set.rules.mjs";

const SRC = "@forwardimpact/libdemo";

function makePackage(overrides = {}) {
  return {
    name: SRC,
    dir: "libraries/libdemo",
    bin: { "fit-demo": "./bin/fit-demo.js" },
    exports: {
      ".": "./src/index.js",
      "./bin/fit-demo.js": "./bin/fit-demo.js",
    },
    ...overrides,
  };
}

function makeLauncher(overrides = {}) {
  const { manifest, ...rest } = overrides;
  return {
    dir: "fit-demo",
    binFiles: ["fit-demo.js"],
    binContent: canonicalBinContent("fit-demo", SRC),
    ...rest,
    manifest:
      manifest === null
        ? null
        : {
            name: "fit-demo",
            version: "0.0.0",
            description: "Run fit-demo from the npm registry",
            type: "module",
            bin: { "fit-demo": "./bin/fit-demo.js" },
            files: ["bin/"],
            dependencies: { [SRC]: "0.0.0" },
            ...(manifest ?? {}),
          },
  };
}

function check({ invokedNames, packages, launchers }) {
  return checkPublicCliSet({
    invokedNames: invokedNames ?? new Set(["fit-demo"]),
    packages: packages ?? [makePackage()],
    launchers: launchers ?? [makeLauncher()],
  });
}

describe("rule membership", () => {
  test("aligned tree reports no problems", () => {
    assert.deepEqual(check({}), []);
  });

  test("invoked bin of a non-private package is a member", () => {
    const set = computePublicCliSet({
      invokedNames: new Set(["fit-demo"]),
      packages: [makePackage()],
    });
    assert.deepEqual([...set.keys()], ["fit-demo"]);
    assert.equal(set.get("fit-demo").srcName, SRC);
  });

  test("a bin no doc, skill, or action invokes stays out (fit-svcmap)", () => {
    const set = computePublicCliSet({
      invokedNames: new Set(["fit-demo"]),
      packages: [
        makePackage(),
        {
          name: "@forwardimpact/svcmap",
          dir: "services/svcmap",
          bin: { "fit-svcmap": "./bin/fit-svcmap.js" },
        },
      ],
    });
    assert.equal(set.has("fit-svcmap"), false);
  });

  test("an invoked name with no bin behind it stays out (fit-graph)", () => {
    const set = computePublicCliSet({
      invokedNames: new Set(["fit-demo", "fit-graph"]),
      packages: [makePackage()],
    });
    assert.equal(set.has("fit-graph"), false);
  });

  test("a private package's bins stay out", () => {
    const set = computePublicCliSet({
      invokedNames: new Set(["fit-demo"]),
      packages: [makePackage({ private: true })],
    });
    assert.equal(set.size, 0);
  });
});

describe("condition (a) — set drift", () => {
  test("missing launcher for a public CLI", () => {
    const problems = check({ launchers: [] });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "drift");
    assert.match(problems[0].message, /fit-demo .*no launchers\/fit-demo/);
  });

  test("stale launcher dir not in the rule output", () => {
    const problems = check({
      launchers: [makeLauncher(), makeLauncher({ dir: "fit-gone" })],
    });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "drift");
    assert.equal(problems[0].path, "launchers/fit-gone");
  });
});

describe("condition (b) — canonical bin shape", () => {
  test("bin file importing the wrong source fails byte-exact equality", () => {
    const problems = check({
      launchers: [
        makeLauncher({
          binContent: canonicalBinContent("fit-demo", "@forwardimpact/other"),
        }),
      ],
    });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "shape");
    assert.match(problems[0].message, /not byte-exact/);
  });

  test("appended third line fails byte-exact equality", () => {
    const problems = check({
      launchers: [
        makeLauncher({
          binContent:
            canonicalBinContent("fit-demo", SRC) + 'console.log("hi");\n',
        }),
      ],
    });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "shape");
  });

  test("a second file in bin/ fails", () => {
    const problems = check({
      launchers: [makeLauncher({ binFiles: ["extra.js", "fit-demo.js"] })],
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /exactly one file/);
  });

  test("source dropping the bin subpath export fails", () => {
    const problems = check({
      packages: [makePackage({ exports: { ".": "./src/index.js" } })],
    });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "shape");
    assert.equal(problems[0].path, "libraries/libdemo/package.json");
  });
});

describe("condition (c) — placeholders", () => {
  test("real version checked in fails", () => {
    const problems = check({
      launchers: [makeLauncher({ manifest: { version: "1.2.3" } })],
    });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "placeholder");
    assert.match(problems[0].message, /version/);
  });

  test("real dependency pin checked in fails", () => {
    const problems = check({
      launchers: [
        makeLauncher({ manifest: { dependencies: { [SRC]: "1.2.3" } } }),
      ],
    });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "placeholder");
    assert.match(problems[0].message, /pin/);
  });
});

describe("condition (d) — manifest schema", () => {
  test("smuggled second dependency fails", () => {
    const problems = check({
      launchers: [
        makeLauncher({
          manifest: { dependencies: { [SRC]: "0.0.0", leftpad: "1.0.0" } },
        }),
      ],
    });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "schema");
    assert.match(problems[0].message, /dependencies must be exactly/);
  });

  test("scripts.postinstall fails the allowed-keys schema", () => {
    const problems = check({
      launchers: [
        makeLauncher({ manifest: { scripts: { postinstall: "curl evil" } } }),
      ],
    });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "schema");
    assert.match(problems[0].message, /"scripts" is outside the allowed set/);
  });

  test("extra files entry fails", () => {
    const problems = check({
      launchers: [makeLauncher({ manifest: { files: ["bin/", "lib/"] } })],
    });
    assert.equal(problems.length, 1);
    assert.match(problems[0].message, /files must be exactly/);
  });

  test("missing or malformed manifest fails", () => {
    const problems = check({ launchers: [makeLauncher({ manifest: null })] });
    assert.equal(problems.length, 1);
    assert.equal(problems[0].kind, "schema");
  });
});
