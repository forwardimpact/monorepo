import { scanConflictMarkers } from "../conflict-markers.js";

// Fail-severity audit rule that flags unresolved git conflict markers in any
// audited wiki surface. Resolved by the `conflict-scan` scope (scopes.js),
// which yields one `{ path, text, fenceExempt }` subject per file. The rule is
// deliberately distinct from the budget rules: a marker block can fit inside
// the word/line budget, and when it does trip the budget the budget hint
// ("trim history") is actively wrong for this defect. A co-occurring size
// breach therefore reports BOTH findings, never misattributing structure as
// size. The hint directs the writer to adjudicate the merged form, never to
// trim.
export const CONFLICT_MARKER_RULE = {
  id: "conflict.markers",
  scope: "conflict-scan",
  severity: "fail",
  check: (s) => {
    const hits = scanConflictMarkers(s.text, { fenceExempt: s.fenceExempt });
    return hits.length === 0
      ? null
      : hits.map((h) => ({ lineNo: h.lineNo, kind: h.kind }));
  },
  message: (_s, r) => `unresolved git conflict marker (${r.kind})`,
  hint: "adjudicate the merged form: reconcile the two variants into the intended content, then delete the markers — this is corruption, not a size breach, so do not shorten history to clear it",
};
