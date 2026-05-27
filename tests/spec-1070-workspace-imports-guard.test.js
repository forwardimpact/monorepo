/**
 * Unit test for the workspace-imports guard.
 *
 * Exercises `findUndeclaredImports` from `scripts/check-workspace-imports.mjs`
 * against synthetic in-memory inputs. The test does not touch real product
 * source — that's covered by the guard running in CI via `bun run invariants`.
 */
import { test, describe } from "node:test";
import assert from "node:assert";

import { findUndeclaredImports } from "../scripts/check-workspace-imports.mjs";

describe("check-workspace-imports guard", () => {
  test("flags a static import of an undeclared workspace package", () => {
    const packageDir = "/synthetic/products/widget";
    const findings = findUndeclaredImports({
      files: [
        {
          path: `${packageDir}/bin/fit-widget.js`,
          source:
            'import { createLogger } from "@forwardimpact/libtelemetry";\n',
          packageDir,
        },
      ],
      manifests: {
        [packageDir]: {
          name: "@forwardimpact/widget",
          dependencies: { "@forwardimpact/libcli": "^0.1.0" },
        },
      },
    });
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].file, `${packageDir}/bin/fit-widget.js`);
    assert.strictEqual(findings[0].packageName, "@forwardimpact/libtelemetry");
    assert.strictEqual(findings[0].line, 1);
  });

  test("accepts a static import of a declared workspace package", () => {
    const packageDir = "/synthetic/products/widget";
    const findings = findUndeclaredImports({
      files: [
        {
          path: `${packageDir}/bin/fit-widget.js`,
          source:
            'import { createLogger } from "@forwardimpact/libtelemetry";\n',
          packageDir,
        },
      ],
      manifests: {
        [packageDir]: {
          name: "@forwardimpact/widget",
          dependencies: { "@forwardimpact/libtelemetry": "^0.1.33" },
        },
      },
    });
    assert.deepStrictEqual(findings, []);
  });

  test("accepts a workspace package declared in devDependencies", () => {
    const packageDir = "/synthetic/products/widget";
    const findings = findUndeclaredImports({
      files: [
        {
          path: `${packageDir}/test/widget.test.js`,
          source: 'import { createHarness } from "@forwardimpact/libmock";\n',
          packageDir,
        },
      ],
      manifests: {
        [packageDir]: {
          name: "@forwardimpact/widget",
          devDependencies: { "@forwardimpact/libmock": "^0.1.14" },
        },
      },
    });
    assert.deepStrictEqual(findings, []);
  });

  test("skips self-imports — a package referencing its own name", () => {
    const packageDir = "/synthetic/products/widget";
    const findings = findUndeclaredImports({
      files: [
        {
          path: `${packageDir}/src/commands/foo.js`,
          source: 'import { bar } from "@forwardimpact/widget";\n',
          packageDir,
        },
      ],
      manifests: {
        [packageDir]: {
          name: "@forwardimpact/widget",
          dependencies: {},
        },
      },
    });
    assert.deepStrictEqual(findings, []);
  });

  test("flags a subpath import where the package is undeclared", () => {
    const packageDir = "/synthetic/products/widget";
    const findings = findUndeclaredImports({
      files: [
        {
          path: `${packageDir}/src/index.js`,
          source:
            'import { bootstrapProject } from "@forwardimpact/libconfig/bootstrap";\n',
          packageDir,
        },
      ],
      manifests: {
        [packageDir]: {
          name: "@forwardimpact/widget",
          dependencies: {},
        },
      },
    });
    assert.strictEqual(findings.length, 1);
    assert.strictEqual(findings[0].packageName, "@forwardimpact/libconfig");
  });
});
