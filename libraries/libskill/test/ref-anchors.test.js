import { test, describe } from "node:test";
import assert from "node:assert";

import { extractRefs } from "../src/action-refs.js";
import {
  buildPlaceholderAllowlist,
  anchorContextual,
  skillDir,
} from "../src/ref-anchors.js";

describe("buildPlaceholderAllowlist", () => {
  test("maps post-@ placeholders to their owner/repo", () => {
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/references/workflow-agent.md",
        text: [
          "- uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}",
          'model: "{{MODEL}}"',
        ].join("\n"),
      },
      {
        path: ".claude/skills/kata-setup/references/workflow-react.md",
        text: "- uses: forwardimpact/fit-eval@{{FIT_EVAL_REF}}",
      },
    ]);
    const allow = buildPlaceholderAllowlist(refs);
    assert.deepStrictEqual(allow.get("{{KATA_AGENT_REF}}"), {
      owner: "forwardimpact",
      repo: "kata-agent",
    });
    assert.deepStrictEqual(allow.get("{{FIT_EVAL_REF}}"), {
      owner: "forwardimpact",
      repo: "fit-eval",
    });
    // Body-only placeholder never appears post-@, so never enters the map.
    assert.ok(!allow.has("{{MODEL}}"));
  });
});

describe("anchorContextual", () => {
  test("anchors a same-dir repo-name match exactly and case-sensitively", () => {
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/references/workflow-agent.md",
        text: [
          "- uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}",
          "In the `kata-agent` step, drop app-id.",
          "a bare `agent` mention",
        ].join("\n"),
      },
    ]);
    const anchored = anchorContextual(refs);
    const kataAgent = anchored.find(
      (r) => r.class === "contextual" && r.repo === "kata-agent",
    );
    assert.deepStrictEqual(kataAgent.anchor, {
      owner: "forwardimpact",
      repo: "kata-agent",
    });
    // A bare `agent` (no hyphen) is not even a candidate token, so it anchors
    // to nothing — the design's "bare `agent` matches the repo of nothing".
    const bareAgent = anchored.find(
      (r) => r.class === "contextual" && r.repo === "agent",
    );
    assert.strictEqual(bareAgent, undefined, "bare 'agent' anchors nothing");
  });

  test("does not anchor across skill directories", () => {
    const refs = extractRefs([
      {
        path: ".claude/skills/kata-setup/SKILL.md",
        text: "- uses: forwardimpact/kata-agent@{{KATA_AGENT_REF}}",
      },
      {
        path: ".claude/skills/other-skill/SKILL.md",
        text: "the `kata-agent@v9.9.9` step",
      },
    ]);
    const anchored = anchorContextual(refs);
    const cross = anchored.find(
      (r) => r.class === "contextual" && r.repo === "kata-agent",
    );
    assert.strictEqual(cross.anchor, null);
  });
});

describe("skillDir", () => {
  test("returns the first two segments under .claude/skills/", () => {
    assert.strictEqual(
      skillDir(".claude/skills/kata-setup/references/workflow-agent.md"),
      ".claude/skills/kata-setup",
    );
    assert.strictEqual(skillDir("libraries/libskill/src/x.js"), null);
  });
});
