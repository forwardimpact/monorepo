import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHmac } from "node:crypto";

const SCRIPT = path.resolve("scripts/env-setup.js");

function parseEnv(content) {
  const map = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    map[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return map;
}

function verifyHs256(jwt, secret) {
  const [h, p, s] = jwt.split(".");
  const expected = createHmac("sha256", secret)
    .update(`${h}.${p}`)
    .digest("base64url");
  return expected === s;
}

describe("scripts/env-setup.js", () => {
  let tmpdir;

  beforeEach(() => {
    tmpdir = mkdtempSync(path.join(os.tmpdir(), "env-setup-test-"));
  });

  afterEach(() => {
    try {
      rmSync(tmpdir, { recursive: true });
    } catch {
      // ignore
    }
  });

  test("first run writes all eight expected keys to .env with chmod 0600", () => {
    const result = spawnSync("bun", [SCRIPT], { cwd: tmpdir });
    assert.strictEqual(
      result.status,
      0,
      `script failed: ${result.stderr?.toString()}`,
    );
    const envPath = path.join(tmpdir, ".env");
    const content = readFileSync(envPath, "utf8");
    const env = parseEnv(content);
    const expected = [
      "SERVICE_SECRET",
      "DATABASE_PASSWORD",
      "MCP_TOKEN",
      "SUPABASE_JWT_SECRET",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
    ];
    for (const key of expected) {
      assert.ok(env[key], `missing ${key} in .env`);
    }
    if (process.platform !== "win32") {
      const mode = statSync(envPath).mode & 0o777;
      assert.strictEqual(mode, 0o600);
    }
  });

  test("second run preserves every value byte-identical (idempotent)", () => {
    spawnSync("bun", [SCRIPT], { cwd: tmpdir });
    const envPath = path.join(tmpdir, ".env");
    const first = parseEnv(readFileSync(envPath, "utf8"));

    spawnSync("bun", [SCRIPT], { cwd: tmpdir });
    const second = parseEnv(readFileSync(envPath, "utf8"));

    for (const key of Object.keys(first)) {
      assert.strictEqual(
        second[key],
        first[key],
        `${key} changed between runs`,
      );
    }
  });

  test("SUPABASE_ANON_KEY verifies against SUPABASE_JWT_SECRET", () => {
    spawnSync("bun", [SCRIPT], { cwd: tmpdir });
    const env = parseEnv(readFileSync(path.join(tmpdir, ".env"), "utf8"));
    assert.ok(
      verifyHs256(env.SUPABASE_ANON_KEY, env.SUPABASE_JWT_SECRET),
      "anon key signature must verify against the JWT secret",
    );
    const payload = JSON.parse(
      Buffer.from(env.SUPABASE_ANON_KEY.split(".")[1], "base64url").toString(),
    );
    assert.strictEqual(payload.role, "anon");
  });

  test("SUPABASE_SERVICE_ROLE_KEY verifies against SUPABASE_JWT_SECRET", () => {
    spawnSync("bun", [SCRIPT], { cwd: tmpdir });
    const env = parseEnv(readFileSync(path.join(tmpdir, ".env"), "utf8"));
    assert.ok(
      verifyHs256(env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_JWT_SECRET),
      "service-role key signature must verify against the JWT secret",
    );
    const payload = JSON.parse(
      Buffer.from(
        env.SUPABASE_SERVICE_ROLE_KEY.split(".")[1],
        "base64url",
      ).toString(),
    );
    assert.strictEqual(payload.role, "service_role");
  });

  test("--output writes lowercase key=value pairs", () => {
    const outPath = path.join(tmpdir, "out");
    const result = spawnSync("bun", [SCRIPT, "--output", outPath], {
      cwd: tmpdir,
    });
    assert.strictEqual(
      result.status,
      0,
      `script failed: ${result.stderr?.toString()}`,
    );
    const content = readFileSync(outPath, "utf8");
    const lines = content.trim().split("\n");
    assert.strictEqual(lines.length, 8);
    for (const line of lines) {
      assert.match(line, /^[a-z_]+=.+$/, `line not lowercase=value: ${line}`);
    }
  });

  test("--add-mask prints ::add-mask:: per value", () => {
    const outPath = path.join(tmpdir, "out");
    const result = spawnSync(
      "bun",
      [SCRIPT, "--output", outPath, "--add-mask"],
      { cwd: tmpdir },
    );
    assert.strictEqual(
      result.status,
      0,
      `script failed: ${result.stderr?.toString()}`,
    );
    const stdout = result.stdout?.toString() ?? "";
    const maskLines = stdout.split("\n").filter((l) =>
      l.startsWith("::add-mask::"),
    );
    assert.strictEqual(maskLines.length, 8);
  });
});
