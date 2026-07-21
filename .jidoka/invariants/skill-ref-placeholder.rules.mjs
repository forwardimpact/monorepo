// Invariant: an action reference written `owner/repo@{{PLACEHOLDER}}` may appear
// only under `.claude/skills/kata-setup/` — the generator skill that substitutes
// the placeholder when it writes workflow files. Anywhere else there is no
// substitution step, so the `{{PLACEHOLDER}}` reaches a consuming repo verbatim
// and can never resolve to a real ref.
//
// This is the offline-checkable slice of the former skill-ref network lint
// (scripts/check-skill-refs.mjs, removed). That lint also probed every action
// ref against GitHub with `git ls-remote` (does the repo/SHA/tag resolve?); the
// invariant host is offline by contract (no subprocess, no network), so the
// reachability assertions have no equivalent here and were dropped with it.
//
// Scope mirrors what the lint scanned: `.claude/skills/**` markdown only. The
// kata-setup directory is excluded because that is exactly where the placeholder
// form is legitimate. Every remaining match is a finding.

const PLACEHOLDER_REF =
  "[A-Za-z0-9._-]+/[A-Za-z0-9._-]+@\\{\\{[A-Z0-9_]+\\}\\}";

export default {
  name: "skill-ref-placeholder",

  build({ grep }) {
    return {
      subjects: {
        "placeholder-ref": grep({
          pattern: PLACEHOLDER_REF,
          paths: [".claude/skills"],
          globs: ["**/*.md", "!**/kata-setup/**"],
          caseSensitive: true,
          dedupe: (m) => `${m.rel}:${m.lineNo}`,
        }),
      },
    };
  },

  rules: ({ failAll }) => [
    failAll("placeholder-ref", {
      id: "skill-ref.placeholder-outside-generator",
      message: (s) =>
        `${s.text.trim()} — action-ref placeholder outside .claude/skills/kata-setup/`,
      hint: "a {{PLACEHOLDER}} in an action ref only resolves inside the kata-setup generator; elsewhere write the literal owner/repo@<ref> the consuming repo should use",
    }),
  ],
};
