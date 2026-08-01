// Invariant: no tracked file may contain a leftover git merge-conflict marker.
// A marker line begins with seven `<` or seven `>` characters. A label
// follows them (`<{7} HEAD`, `>{7} branch`). Git writes these lines when a
// merge or a rebase conflicts. If you commit them, you ship a broken file.
// The file is often unparseable. jidoka-setup drops this generic starter rule
// into every new repository. It applies to any language. It needs no
// configuration. It fires only on a real, unambiguous problem. Delete it once
// the repo has its own invariants. You can also keep it. Nobody intends an
// unresolved conflict.
//
// The pattern uses the `<{7}`/`>{7}` regex quantifier. It contains no literal
// run of the characters. So this module never matches itself. The pattern
// leaves out the middle `=======` separator on purpose. A run of seven `=`
// on its own line is legitimate (reStructuredText and some Markdown section
// underlines). The begin and end markers alone already prove a conflict.

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
      hint: "resolve the conflict. Delete the marker lines git inserted. Run the check again",
    }),
  ],
};
