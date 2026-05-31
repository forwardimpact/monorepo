import { describe, test } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";

import { composeProfilePrompt } from "@forwardimpact/libeval";

const RT = createDefaultRuntime();

const FIXTURES = fileURLToPath(
  new URL("./fixtures/profile-prompt", import.meta.url),
);
const LIVE_PROFILES = fileURLToPath(
  new URL("../../../.claude/agents", import.meta.url),
);

describe("composeProfilePrompt", () => {
  test("returns preset-shaped object", () => {
    const result = composeProfilePrompt("with-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
    });
    assert.strictEqual(result.type, "preset");
    assert.strictEqual(result.preset, "claude_code");
    assert.strictEqual(typeof result.append, "string");
  });

  test("strips YAML frontmatter", () => {
    const result = composeProfilePrompt("with-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
    });
    assert.ok(
      !result.append.includes("---"),
      "append should not contain the frontmatter fence",
    );
    assert.ok(
      !result.append.includes("description:"),
      "append should not leak YAML keys",
    );
    assert.ok(
      !result.append.includes("skills:"),
      "append should not leak the skills list",
    );
    assert.ok(
      result.append.startsWith("You are the fixture agent."),
      "append should start with the body content",
    );
  });

  test("uses entire body when frontmatter is absent", () => {
    const result = composeProfilePrompt("no-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
    });
    assert.ok(result.append.startsWith("You are the frontmatter-less"));
  });

  test("concatenates trailer with blank-line separator", () => {
    const result = composeProfilePrompt("with-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
      trailer: "TRAILER_TEXT",
    });
    assert.ok(result.append.endsWith("\n\nTRAILER_TEXT"));
    assert.ok(result.append.includes("You are the fixture agent."));
  });

  test("omits trailer cleanly when not provided", () => {
    const result = composeProfilePrompt("with-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
    });
    assert.ok(
      !result.append.endsWith("\n\n"),
      "append should not have trailing blank lines when no trailer",
    );
  });

  test("treats empty trailer as omitted", () => {
    const result = composeProfilePrompt("with-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
      trailer: "",
    });
    assert.ok(!result.append.endsWith("\n\n"));
  });

  test("throws ENOENT for missing profile", () => {
    assert.throws(
      () =>
        composeProfilePrompt("does-not-exist", {
          profilesDir: FIXTURES,
          runtime: RT,
        }),
      /ENOENT/,
    );
  });

  test("every live .claude/agents profile is loadable (SC#1)", () => {
    const entries = readdirSync(LIVE_PROFILES, { withFileTypes: true });
    const profileFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => e.name);

    assert.ok(
      profileFiles.length > 0,
      "expected at least one live profile under .claude/agents",
    );

    for (const fileName of profileFiles) {
      const name = fileName.slice(0, -".md".length);
      const result = composeProfilePrompt(name, {
        profilesDir: LIVE_PROFILES,
        runtime: RT,
      });

      const raw = readFileSync(`${LIVE_PROFILES}/${fileName}`, "utf8");
      const bodyStart = raw.indexOf("\n---\n");
      const body = bodyStart === -1 ? raw : raw.slice(bodyStart + 5);
      const probe = body.trim().slice(0, 40);

      assert.ok(
        probe.length > 0,
        `expected ${fileName} to have non-empty body`,
      );
      assert.ok(
        result.append.includes(probe),
        `expected composed prompt for ${name} to include body substring "${probe}"`,
      );
    }
  });
});
