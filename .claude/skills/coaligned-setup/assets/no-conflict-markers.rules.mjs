// Invariant: no tracked file may contain a leftover git merge-conflict marker —
// a line that begins with seven `<` or seven `>` characters followed by a label
// (`<{7} HEAD`, `>{7} branch`). Git writes these when a merge or rebase
// conflicts; committing them ships a broken, often unparseable file. This is
// the generic starter rule coaligned-setup drops into every new repository: it
// applies to any language, needs no configuration, and fires only on a real,
// unambiguous problem. Delete it once the repo has invariants of its own, or
// keep it — an unresolved conflict is never intended.
//
// The pattern is written with the `<{7}`/`>{7}` regex quantifier rather than a
// literal run of the characters, so this module never matches itself. The
// middle `=======` separator is deliberately left out: a run of seven `=` on
// its own line occurs legitimately (reStructuredText and some Markdown section
// underlines), and the begin/end markers already prove a conflict on their own.

const CONFLICT_MARKER = "^(<{7}|>{7})[ \\t]";

export default {
  name: "no-conflict-markers",

  build({ grep }) {
    return {
      subjects: {
        "conflict-marker": grep({
          pattern: CONFLICT_MARKER,
          caseSensitive: true,
          dedupe: (m) => `${m.rel}:${m.lineNo}`,
        }),
      },
    };
  },

  rules: ({ failAll }) => [
    failAll("conflict-marker", {
      id: "no-conflict-markers.present",
      message: (s) => `leftover merge-conflict marker: ${s.text.trim()}`,
      hint: "resolve the conflict and delete the marker lines git inserted, then re-run the check",
    }),
  ],
};
