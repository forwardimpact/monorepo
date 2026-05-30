import { STATUS_ID_REGEX } from "../status.js";

// Validate every row inside wiki/STATUS.md's code fence against the
// `{id}<TAB>{phase}<TAB>{status}` shape. Rows are resolved by the `status-row`
// scope in scopes.js; each subject carries `{ cells, id, phase, status, text }`.

const PHASES = new Set(["spec", "design", "plan"]);
const STATUSES = new Set(["draft", "approved", "implemented", "cancelled"]);

const hasThreeCells = (s) => s.cells.length === 3;

export const STATUS_ROW_RULES = [
  {
    id: "status-row.shape",
    scope: "status-row",
    severity: "fail",
    check: (s) =>
      hasThreeCells(s) ? null : { actual: s.cells.length, text: s.text },
    message: (_s, r) =>
      `${r.actual} tab-separated field(s), expected 3: "${r.text}"`,
    hint: "each STATUS row is `{id}<TAB>{phase}<TAB>{status}`",
  },
  {
    id: "status-row.id-format",
    scope: "status-row",
    severity: "fail",
    when: hasThreeCells,
    check: (s) => (STATUS_ID_REGEX.test(s.id) ? null : { id: s.id }),
    message: (_s, r) => `Bad id '${r.id}' (expected ^\\d{4}(/[a-z0-9-]+)?$)`,
    hint: "spec ids are four digits; a sub-row appends `/<unit>` (e.g. 1370/libutil)",
  },
  {
    id: "status-row.phase",
    scope: "status-row",
    severity: "fail",
    when: hasThreeCells,
    check: (s) => (PHASES.has(s.phase) ? null : { phase: s.phase }),
    message: (_s, r) => `Bad phase '${r.phase}' (expected spec|design|plan)`,
    hint: "phase is one of spec, design, plan",
  },
  {
    id: "status-row.status",
    scope: "status-row",
    severity: "fail",
    when: hasThreeCells,
    check: (s) => (STATUSES.has(s.status) ? null : { status: s.status }),
    message: (_s, r) =>
      `Bad status '${r.status}' (expected draft|approved|implemented|cancelled)`,
    hint: "status is one of draft, approved, implemented, cancelled",
  },
];
