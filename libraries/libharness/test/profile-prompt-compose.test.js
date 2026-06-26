import { describe, test } from "node:test";
import assert from "node:assert";
import { readdirSync, readFileSync } from "node:fs";

import { composeProfilePrompt } from "@forwardimpact/libharness";

import { RT, FIXTURES, LIVE_PROFILES } from "./profile-prompt-helpers.js";

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
      result.append.startsWith("<agent_profile>\nYou are the fixture agent."),
      "body content should open the <agent_profile> section",
    );
  });

  test("wraps the profile body in <agent_profile>", () => {
    const result = composeProfilePrompt("with-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
    });
    assert.ok(result.append.startsWith("<agent_profile>\n"));
    assert.ok(result.append.endsWith("\n</agent_profile>"));
  });

  test("uses entire body when frontmatter is absent", () => {
    const result = composeProfilePrompt("no-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
    });
    assert.ok(
      result.append.startsWith("<agent_profile>\nYou are the frontmatter-less"),
    );
  });

  test("wraps the trailer in a sibling <session_protocol> section", () => {
    const result = composeProfilePrompt("with-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
      trailer: "TRAILER_TEXT",
    });
    assert.ok(result.append.includes("You are the fixture agent."));
    assert.ok(
      result.append.includes(
        "</agent_profile>\n\n<session_protocol>\nTRAILER_TEXT\n</session_protocol>",
      ),
      "sections are siblings joined by a blank line",
    );
    assert.ok(
      result.append.indexOf("<agent_profile>") <
        result.append.indexOf("<session_protocol>"),
      "profile precedes protocol",
    );
  });

  test("the two sections are siblings — neither nests in the other", () => {
    const result = composeProfilePrompt("with-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
      trailer: "TRAILER_TEXT",
    });
    assert.ok(
      result.append.indexOf("</agent_profile>") <
        result.append.indexOf("<session_protocol>"),
      "<agent_profile> closes before <session_protocol> opens",
    );
  });

  test("omits the <session_protocol> section when no trailer is provided", () => {
    const result = composeProfilePrompt("with-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
    });
    assert.ok(!result.append.includes("<session_protocol>"));
    assert.ok(result.append.endsWith("</agent_profile>"));
  });

  test("treats empty trailer as omitted", () => {
    const result = composeProfilePrompt("with-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
      trailer: "",
    });
    assert.ok(!result.append.includes("<session_protocol>"));
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

describe("composeProfilePrompt — hoisted ## Session Protocol", () => {
  test("lifts the section out of <agent_profile> into <session_protocol>", () => {
    const result = composeProfilePrompt("with-session-protocol", {
      profilesDir: FIXTURES,
      runtime: RT,
      trailer: "TRAILER_TEXT",
    });
    const profileEnd = result.append.indexOf("</agent_profile>");
    const protocolStart = result.append.indexOf("<session_protocol>");
    const hoistedAt = result.append.indexOf(
      "Before any task, boot the work routine fixture step.",
    );
    assert.ok(profileEnd !== -1 && protocolStart > profileEnd);
    assert.ok(
      hoistedAt > protocolStart,
      "hoisted work routine lands inside <session_protocol>",
    );
  });

  test("drops the heading line itself", () => {
    const result = composeProfilePrompt("with-session-protocol", {
      profilesDir: FIXTURES,
      runtime: RT,
      trailer: "TRAILER_TEXT",
    });
    assert.ok(
      !result.append.includes("## Session Protocol"),
      "the <session_protocol> tag replaces the heading",
    );
  });

  test("keeps persona sections on both sides of the hoist in <agent_profile>", () => {
    const result = composeProfilePrompt("with-session-protocol", {
      profilesDir: FIXTURES,
      runtime: RT,
      trailer: "TRAILER_TEXT",
    });
    const profileBody = result.append.slice(
      result.append.indexOf("<agent_profile>"),
      result.append.indexOf("</agent_profile>"),
    );
    assert.ok(
      profileBody.includes("## Voice"),
      "section before the hoist stays",
    );
    assert.ok(
      profileBody.includes("## Constraints"),
      "section after the hoist stays",
    );
    assert.ok(profileBody.includes("— Hoist Fixture 🪝"));
    assert.ok(
      !profileBody.includes("Before any task"),
      "hoisted content does not remain in the persona",
    );
  });

  test("keeps a level-3 subsection inside the hoisted section", () => {
    const result = composeProfilePrompt("with-session-protocol", {
      profilesDir: FIXTURES,
      runtime: RT,
      trailer: "TRAILER_TEXT",
    });
    const protocolBody = result.append.slice(
      result.append.indexOf("<session_protocol>"),
      result.append.indexOf("</session_protocol>"),
    );
    assert.ok(
      protocolBody.includes("### Routing"),
      "a ### subsection does not terminate the hoist",
    );
  });

  test("orders trailer, then hoisted section, within <session_protocol>", () => {
    const result = composeProfilePrompt("with-session-protocol", {
      profilesDir: FIXTURES,
      runtime: RT,
      trailer: "TRAILER_TEXT",
    });
    assert.ok(
      result.append.indexOf("TRAILER_TEXT") <
        result.append.indexOf("Before any task"),
      "the orchestration trailer precedes the hoisted work routine",
    );
  });

  test("emits <session_protocol> from the hoist even with no trailer", () => {
    const result = composeProfilePrompt("with-session-protocol", {
      profilesDir: FIXTURES,
      runtime: RT,
    });
    assert.ok(result.append.includes("<session_protocol>"));
    assert.ok(result.append.includes("Before any task"));
    assert.ok(!result.append.includes("## Session Protocol"));
  });

  test("a profile with no such heading keeps its whole body in <agent_profile>", () => {
    const result = composeProfilePrompt("with-frontmatter", {
      profilesDir: FIXTURES,
      runtime: RT,
    });
    assert.ok(!result.append.includes("<session_protocol>"));
  });
});
