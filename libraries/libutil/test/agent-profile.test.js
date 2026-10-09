import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_PROFILES_DIR,
  frontmatterField,
  isAgentProfile,
} from "../src/agent-profile.js";

const PROFILE = [
  "---",
  "name: staff-engineer",
  "description: >",
  "  Repository staff engineer.",
  "---",
  "You are the staff engineer.",
  "",
].join("\n");

describe("agent-profile", () => {
  test("names the runtime profiles directory", () => {
    assert.equal(AGENT_PROFILES_DIR, ".claude/agents");
  });

  test("a file with name and description frontmatter is a profile", () => {
    assert.equal(isAgentProfile(PROFILE), true);
  });

  test("a reference whose fenced example indents the name line is not a profile", () => {
    const reference = [
      "# Team Protocol",
      "",
      "```yaml",
      "  name: example",
      "  description: shown in a fence",
      "```",
      "",
    ].join("\n");
    assert.equal(isAgentProfile(reference), false);
    // The same lines at line start count. The predicate reads line starts only.
    assert.equal(
      isAgentProfile("```yaml\nname: x\ndescription: y\n```\n"),
      true,
    );
  });

  test("an empty string and a non-string are not profiles", () => {
    assert.equal(isAgentProfile(""), false);
    assert.equal(isAgentProfile(undefined), false);
    assert.equal(isAgentProfile(null), false);
  });

  test("frontmatterField reads the first value at line start", () => {
    assert.equal(frontmatterField(PROFILE, "name"), "staff-engineer");
    assert.equal(frontmatterField("name:  spaced  \n", "name"), "spaced");
    assert.equal(frontmatterField(PROFILE, "skills"), "");
    assert.equal(frontmatterField(undefined, "name"), "");
  });

  test("frontmatterField on a folded scalar returns the fold marker", () => {
    // `>` is enough for the predicate: the field is present.
    assert.equal(frontmatterField(PROFILE, "description"), ">");
  });
});
