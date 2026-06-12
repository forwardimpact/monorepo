// Keep every Claude model identifier anchored to the role-named constants
// in libraries/libutil/src/models.js — the single home for model defaults.
//
// Rule 1 (code): no model-ID literal in src/ or bin/ JavaScript. Runtime
// defaults and help text must import from @forwardimpact/libutil/models so
// a model upgrade is a values-only edit in one file.
//
// Rule 2 (docs): markdown cannot import constants, so any model ID written
// in docs or skills must equal a value currently exported by models.js.
// When an upgrade changes a value, the stale doc lines fail here instead of
// silently drifting.
//
// Out of scope: specs/, wiki/, benchmarks/ (historical records), test files
// and libmock (fixture data — arbitrary sample values, not defaults).

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertRgAvailable, rgMatches } from "./lib/rg.mjs";

const MODELS_PATH = "libraries/libutil/src/models.js";

// Matches model IDs (claude-fable-5, claude-haiku-4-5-20251001) and the
// optional 1M-context suffix; the family list keeps `claude-agent-sdk`,
// `claude-settings.yaml`, and similar names out.
const MODEL_ID =
  "claude-(fable|opus|sonnet|haiku)-[0-9][a-zA-Z0-9.-]*(\\[1m\\])?";

const BASE_GLOBS = [
  "!.git/**",
  "!node_modules/**",
  "!generated/**",
  "!specs/**",
  "!wiki/**",
  "!benchmarks/**",
  // This module names example IDs in its comments and would match them.
  "!.coaligned/invariants/model-defaults.rules.mjs",
];

export default {
  name: "model-defaults",

  async build({ root }) {
    assertRgAvailable();
    const allowed = new Set(
      Object.values(await import(pathToFileURL(resolve(root, MODELS_PATH)))),
    );

    // ripgrep gives the *last* matching glob precedence, so the shared
    // exclusions come after each rule's include globs to win.
    const codeHits = rgMatches({
      cwd: root,
      pattern: MODEL_ID,
      caseSensitive: true,
      paths: ["libraries", "products", "services", "scripts", ".coaligned"],
      globs: [
        "*.{js,mjs,ts}",
        "!**/test/**",
        "!**/*.test.js",
        "!libraries/libmock/**",
        `!${MODELS_PATH}`,
        ...BASE_GLOBS,
      ],
    }).map((m) => ({
      path: resolve(root, m.path),
      lineNo: m.lineNo,
      text: m.text,
    }));

    const docHits = rgMatches({
      cwd: root,
      pattern: MODEL_ID,
      caseSensitive: true,
      globs: ["*.md", ...BASE_GLOBS],
      onlyMatching: true,
    }).map((m) => ({
      path: resolve(root, m.path),
      lineNo: m.lineNo,
      id: m.text,
    }));

    return {
      subjects: { "code-hit": codeHits, "doc-hit": docHits },
      ctx: { allowed },
    };
  },

  rules: [
    {
      id: "model.literal-in-code",
      scope: "code-hit",
      severity: "fail",
      check: () => ({}),
      message: (s) => `model-ID literal in code: ${s.text.trim()}`,
      hint: "import the role constant from @forwardimpact/libutil/models so a model upgrade is a values-only edit in one file",
    },
    {
      id: "model.stale-doc-id",
      scope: "doc-hit",
      severity: "fail",
      check: (s, c) => (c.allowed.has(s.id) ? null : { id: s.id }),
      message: (s, r) =>
        `model ID "${r.id}" does not match any value exported by ${MODELS_PATH}`,
      hint: "update the doc to the current value",
    },
  ],
};
