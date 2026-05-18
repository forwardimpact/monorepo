/**
 * Coverage for the widened scope of the check-workspace-imports guard:
 *  - the `workspacePackages` filter, which suppresses imports that point at
 *    something outside the workspace (a different failure mode — Node's
 *    resolver catches them at runtime), and
 *  - that the guard accepts files from `libraries/*` and `services/*`
 *    package directories on the same terms as `products/*`.
 */
import { test, describe } from "node:test";
import assert from "node:assert";

import { findUndeclaredImports } from "../scripts/check-workspace-imports.mjs";

describe("check-workspace-imports — workspacePackages filter", () => {
  test("ignores imports for packages that are not in the workspace", () => {
    const packageDir = "/synthetic/libraries/libfoo";
    const findings = findUndeclaredImports({
      files: [
        {
          path: `${packageDir}/test/libfoo.perf.js`,
          source: 'import { run } from "@forwardimpact/libphantom";\n',
          packageDir,
        },
      ],
      manifests: {
        [packageDir]: { name: "@forwardimpact/libfoo", dependencies: {} },
      },
      workspacePackages: new Set([
        "@forwardimpact/libfoo",
        "@forwardimpact/libreal",
      ]),
    });
    assert.deepStrictEqual(findings, []);
  });

  test("still flags an undeclared import for a real workspace package", () => {
    const packageDir = "/synthetic/libraries/libfoo";
    const findings = findUndeclaredImports({
      files: [
        {
          path: `${packageDir}/src/index.js`,
          source: 'import { x } from "@forwardimpact/libreal";\n',
          packageDir,
        },
      ],
      manifests: {
        [packageDir]: { name: "@forwardimpact/libfoo", dependencies: {} },
      },
      workspacePackages: new Set([
        "@forwardimpact/libfoo",
        "@forwardimpact/libreal",
      ]),
    });
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].packageName, "@forwardimpact/libreal");
  });
});

describe("check-workspace-imports — libraries/* and services/* coverage", () => {
  test("flags an undeclared workspace import in a library", () => {
    const packageDir = "/synthetic/libraries/libfoo";
    const findings = findUndeclaredImports({
      files: [
        {
          path: `${packageDir}/src/index.js`,
          source:
            'import { createLogger } from "@forwardimpact/libtelemetry";\n',
          packageDir,
        },
      ],
      manifests: {
        [packageDir]: {
          name: "@forwardimpact/libfoo",
          dependencies: {},
        },
      },
      workspacePackages: new Set([
        "@forwardimpact/libfoo",
        "@forwardimpact/libtelemetry",
      ]),
    });
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].packageName, "@forwardimpact/libtelemetry");
    assert.strictEqual(findings[0].packageDir, packageDir);
  });

  test("flags an undeclared workspace import in a service", () => {
    const packageDir = "/synthetic/services/foo";
    const findings = findUndeclaredImports({
      files: [
        {
          path: `${packageDir}/server.js`,
          source:
            'import { createLogger } from "@forwardimpact/libtelemetry";\n',
          packageDir,
        },
      ],
      manifests: {
        [packageDir]: {
          name: "@forwardimpact/svcfoo",
          dependencies: { "@forwardimpact/librpc": "^0.1.0" },
        },
      },
      workspacePackages: new Set([
        "@forwardimpact/svcfoo",
        "@forwardimpact/librpc",
        "@forwardimpact/libtelemetry",
      ]),
    });
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].packageName, "@forwardimpact/libtelemetry");
  });

  test("accepts a declared workspace import in a service", () => {
    const packageDir = "/synthetic/services/foo";
    const findings = findUndeclaredImports({
      files: [
        {
          path: `${packageDir}/server.js`,
          source:
            'import { createLogger } from "@forwardimpact/libtelemetry";\n',
          packageDir,
        },
      ],
      manifests: {
        [packageDir]: {
          name: "@forwardimpact/svcfoo",
          dependencies: { "@forwardimpact/libtelemetry": "^0.1.41" },
        },
      },
      workspacePackages: new Set([
        "@forwardimpact/svcfoo",
        "@forwardimpact/libtelemetry",
      ]),
    });
    assert.deepStrictEqual(findings, []);
  });
});
