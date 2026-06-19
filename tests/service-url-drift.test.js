// Unit test for the service-url-drift invariant. Lives in tests/ (the
// repo-root test set the `bun run test` glob scans) rather than co-located in
// .coaligned/, matching tests/check-public-cli-set.test.js, so the rule module
// and helper's workspace deps (yaml, acorn) resolve from the repo root.

import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

import { createBuildKit, RULE_KIT } from "@forwardimpact/libcoaligned";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import {
  extractDefaults,
  normalizeHost,
  urlsEqual,
  NonLiteralDefaultsError,
} from "../.coaligned/invariants/service-url-drift.url.mjs";
import ruleModule from "../.coaligned/invariants/service-url-drift.rules.mjs";

const manifest = (name, defaults) =>
  `import { createServiceConfig } from "@forwardimpact/libconfig";\n` +
  `const config = await createServiceConfig(${JSON.stringify(name)}${defaults === undefined ? "" : `, ${defaults}`});\n` +
  `await config;\n`;

function expectedUrlFromSource(name, source) {
  const d = extractDefaults(source, `${name}.js`, name);
  const protocol = d.protocol ?? "grpc";
  const host = d.host ?? "0.0.0.0";
  const port = d.port ?? 3000;
  const path = d.path ?? "";
  return `${protocol}://${host}:${port}${path}`;
}

// Mirrors libutil/src/rules.js applyRule (including the `when` guard) — the
// production host supplies the real runRules. The rule module itself cannot
// import @forwardimpact/*; this test, which runs from the repo root, drives it
// through the real build kit and rule kit.
function applyRule(rule, subject) {
  if (rule.when && !rule.when(subject, {})) return [];
  const result = rule.check(subject, {});
  if (result == null) return [];
  const items = Array.isArray(result) ? result : [result];
  return items.map((item) => ({
    id: rule.id,
    level: rule.severity,
    path: subject.path ?? null,
    lineNo: item.lineNo ?? subject.lineNo ?? null,
    message: rule.message(subject, item, {}),
    hint: rule.hint ?? null,
  }));
}

function runModuleRules(mod, subjects) {
  const rules =
    typeof mod.rules === "function" ? mod.rules(RULE_KIT) : mod.rules;
  return rules.flatMap((rule) =>
    (subjects[rule.scope] ?? []).flatMap((subject) => applyRule(rule, subject)),
  );
}

describe("expected-url helper", () => {
  test("absent defaults arg → libconfig grpc default", () => {
    assert.equal(
      expectedUrlFromSource("trace", manifest("trace")),
      "grpc://0.0.0.0:3000",
    );
  });

  test("port-only grpc declaration", () => {
    assert.equal(
      expectedUrlFromSource("trace", manifest("trace", "{ port: 3001 }")),
      "grpc://0.0.0.0:3001",
    );
  });

  test("protocol + port http declaration", () => {
    assert.equal(
      expectedUrlFromSource(
        "mcp",
        manifest("mcp", '{ protocol: "http", port: 3011 }'),
      ),
      "http://0.0.0.0:3011",
    );
  });

  test("ghserver private host is preserved", () => {
    assert.equal(
      expectedUrlFromSource(
        "ghserver",
        manifest("ghserver", '{ host: "127.0.0.1", port: 3007 }'),
      ),
      "grpc://127.0.0.1:3007",
    );
  });

  test("non-literal defaults throw", () => {
    assert.throws(
      () => extractDefaults(manifest("x", "defaults"), "x.js", "x"),
      NonLiteralDefaultsError,
    );
  });

  test("normalizeHost collapses the local representations", () => {
    for (const h of [
      "0.0.0.0",
      "localhost",
      "127.0.0.1",
      "trace.guide.local",
    ]) {
      assert.equal(normalizeHost(h, "trace"), "localhost");
    }
    assert.equal(
      normalizeHost("embedding.local", "embedding"),
      "embedding.local",
    );
  });

  test("urlsEqual sees through bind/advertised host forms", () => {
    assert.ok(
      urlsEqual("grpc://0.0.0.0:3001", "grpc://localhost:3001", "trace"),
    );
    assert.ok(
      urlsEqual("grpc://127.0.0.1:3007", "grpc://localhost:3007", "ghserver"),
    );
    // The shipped http services bind 0.0.0.0 and advertise localhost (oidc).
    assert.ok(
      urlsEqual("http://0.0.0.0:3008", "http://localhost:3008", "oidc"),
    );
    assert.ok(
      !urlsEqual("http://localhost:3011", "http://localhost:3008", "mcp"),
    );
    assert.ok(
      !urlsEqual("grpc://localhost:3001", "http://localhost:3001", "x"),
    );
  });
});

function fixtureRepo({ manifestDefaults, envValue }) {
  const root = mkdtempSync(join(tmpdir(), "surldrift-"));
  mkdirSync(join(root, "services", "demo"), { recursive: true });
  mkdirSync(join(root, ".coaligned", "invariants"), { recursive: true });
  writeFileSync(
    join(root, "services", "demo", "server.js"),
    manifest("demo", manifestDefaults),
  );
  writeFileSync(
    join(root, ".env.local.example"),
    `SERVICE_DEMO_URL=${envValue}\n`,
  );
  writeFileSync(
    join(root, ".coaligned", "invariants", "service-url-drift.registry.yml"),
    [
      "services:",
      "  demo:",
      "    manifest: services/demo/server.js",
      "    consumers:",
      "      - { kind: env, path: .env.local.example }",
      "",
    ].join("\n"),
  );
  return root;
}

async function findingsFor(root) {
  const kit = createBuildKit({
    root,
    dir: join(root, ".coaligned", "invariants"),
    runtime: createDefaultRuntime(),
  });
  const { subjects } = await ruleModule.build(kit);
  return runModuleRules(ruleModule, subjects);
}

describe("service-url-drift rule module", () => {
  test("matching consumer → no finding", async () => {
    const root = fixtureRepo({
      manifestDefaults: "{ port: 3001 }",
      envValue: "grpc://localhost:3001",
    });
    assert.deepEqual(await findingsFor(root), []);
  });

  test("wrong consumer → finding names service, path, restated, expected (criterion 3)", async () => {
    const root = fixtureRepo({
      manifestDefaults: "{ port: 3001 }",
      envValue: "grpc://localhost:9999",
    });
    const findings = await findingsFor(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].id, "service-url.drift");
    assert.equal(findings[0].level, "fail");
    assert.match(findings[0].message, /demo:/);
    assert.match(findings[0].message, /\.env\.local\.example/);
    assert.match(findings[0].message, /grpc:\/\/localhost:9999/);
    assert.match(findings[0].message, /grpc:\/\/0\.0\.0\.0:3001/);
  });

  test("manifest change leaving consumer stale → finding (criterion 4)", async () => {
    const root = fixtureRepo({
      manifestDefaults: "{ port: 3002 }",
      envValue: "grpc://localhost:3001",
    });
    const findings = await findingsFor(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /expected grpc:\/\/0\.0\.0\.0:3002/);
  });

  test("new registry row with seeded disagreement → identical finding shape (criterion 5)", async () => {
    // A second service added to the registry behaves exactly like the first.
    const root = fixtureRepo({
      manifestDefaults: "{ port: 3001 }",
      envValue: "grpc://localhost:3001",
    });
    mkdirSync(join(root, "services", "newsvc"), { recursive: true });
    writeFileSync(
      join(root, "services", "newsvc", "server.js"),
      manifest("newsvc", "{ port: 4001 }"),
    );
    writeFileSync(
      join(root, ".env.local.example"),
      "SERVICE_DEMO_URL=grpc://localhost:3001\nSERVICE_NEWSVC_URL=grpc://localhost:9999\n",
    );
    writeFileSync(
      join(root, ".coaligned", "invariants", "service-url-drift.registry.yml"),
      [
        "services:",
        "  demo:",
        "    manifest: services/demo/server.js",
        "    consumers: [{ kind: env, path: .env.local.example }]",
        "  newsvc:",
        "    manifest: services/newsvc/server.js",
        "    consumers: [{ kind: env, path: .env.local.example }]",
        "",
      ].join("\n"),
    );
    const findings = await findingsFor(root);
    assert.equal(findings.length, 1);
    assert.match(findings[0].message, /newsvc:/);
    assert.match(findings[0].message, /grpc:\/\/localhost:9999/);
    assert.match(findings[0].message, /expected grpc:\/\/0\.0\.0\.0:4001/);
  });
});
