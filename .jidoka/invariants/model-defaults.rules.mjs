// Keep every Claude model identifier anchored to the role-named constants
// in libraries/libutil/src/models.js. That file is the single home for
// model defaults.
//
// Rule 1 (code): no model-ID literal in src/ or bin/ JavaScript. Runtime
// defaults and help text must import from @forwardimpact/libutil/models so
// a model upgrade is a values-only edit in one file.
//
// Rule 2 (docs): markdown cannot import constants. So any model ID in docs
// or skills must equal a value models.js currently exports. When an upgrade
// changes a value, the stale doc lines fail here. They do not drift
// silently.
//
// Out of scope: specs/, references/, wiki/, benchmarks/ (historical
// records), test files and libmock. Test files and libmock hold fixture
// data. Fixture data is an arbitrary sample value. It is not a default.

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MODELS_PATH = "libraries/libutil/src/models.js";

// Matches model IDs (claude-fable-5, claude-haiku-4-5-20251001) and the
// optional 1M-context suffix. The family list keeps `claude-agent-sdk`,
// `claude-settings.yaml`, and similar names out.
const MODEL_ID =
  "claude-(fable|opus|sonnet|haiku)-[0-9][a-zA-Z0-9.-]*(\\[1m\\])?";

const BASE_GLOBS = [
  "!.git/**",
  "!node_modules/**",
  "!generated/**",
  "!specs/**",
  // Reference specs for external-repo implementations (references/*) may
  // name model ids as part of the external build documentation. They are
  // out of scope, like specs/.
  "!references/**",
  "!wiki/**",
  "!benchmarks/**",
  // This module names example IDs in its comments and would match them.
  "!.jidoka/invariants/model-defaults.rules.mjs",
  // Co-located action sources are byte-faithful projections of their
  // sibling repos. The canonical home is the sibling, and this tree mirrors
  // it verbatim. Nobody can reword a model ID in their READMEs without a
  // divergent projection. So they are out of scope, like specs/ and
  // benchmarks/.
  "!products/gemba/actions/**",
  "!products/kata/actions/**",
];

export default {
  name: "model-defaults",

  async build({ root, grep }) {
    const allowed = new Set(
      Object.values(await import(pathToFileURL(resolve(root, MODELS_PATH)))),
    );

    // ripgrep gives precedence to the *last* glob that matches. So the
    // shared exclusions come after each rule's include globs to win.
    const codeHits = grep({
      pattern: MODEL_ID,
      caseSensitive: true,
      paths: ["libraries", "products", "services", "scripts", ".jidoka"],
      globs: [
        "*.{js,mjs,ts}",
        "!**/test/**",
        "!**/*.test.js",
        "!libraries/libmock/**",
        `!${MODELS_PATH}`,
        ...BASE_GLOBS,
      ],
    });

    const docHits = grep({
      pattern: MODEL_ID,
      caseSensitive: true,
      // Test fixtures hold frozen sample content, for example a verbatim
      // copy of a historical regression corpus. They do not hold live
      // defaults. They are out of scope per the header, the same as the
      // code rule above.
      globs: ["*.md", "!**/test/**", ...BASE_GLOBS],
      onlyMatching: true,
    }).map((m) => ({ path: m.path, lineNo: m.lineNo, id: m.text }));

    return {
      subjects: { "code-hit": codeHits, "doc-hit": docHits },
      ctx: { allowed },
    };
  },

  rules: ({ failAll }) => [
    failAll("code-hit", {
      id: "model.literal-in-code",
      message: (s) => `model-ID literal in code: ${s.text.trim()}`,
      hint: "import the role constant from @forwardimpact/libutil/models so a model upgrade is a values-only edit in one file",
    }),
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
