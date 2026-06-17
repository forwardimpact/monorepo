import { STATUS_ID_REGEX } from "../status.js";

// Validate every row inside wiki/STATUS.md's code fence. Rows are resolved by
// the `status-row` scope in scopes.js; each subject carries
// `{ cells, id, phase, status, kind, text }`. Two row kinds share the fence:
//
//   spec        `{id}<TAB>{phase}<TAB>{status}` — three cells
//   experiment  `exp:{issue}<TAB>{state}<TAB>{pin}<TAB>{plan-ref}` — four cells
//
// Spec-shaped rules run for every non-experiment row (`kind !== "experiment"`,
// which includes an unrecognized id so a malformed id still flags). Experiment
// rules run only for `kind === "experiment"`.

const PHASES = new Set(["spec", "design", "plan"]);
const STATUSES = new Set(["draft", "approved", "implemented", "cancelled"]);
const EXP_STATES = new Set(["registered", "approved", "cancelled"]);
const PIN_RE = /^[0-9a-f]{40}$/;

const isSpecShaped = (s) => s.kind !== "experiment";
const isExperiment = (s) => s.kind === "experiment";
const hasThreeCells = (s) => isSpecShaped(s) && s.cells.length === 3;
const hasFourCells = (s) => isExperiment(s) && s.cells.length === 4;

export const STATUS_ROW_RULES = [
  {
    id: "status-row.shape",
    scope: "status-row",
    severity: "fail",
    when: isSpecShaped,
    check: (s) =>
      s.cells.length === 3 ? null : { actual: s.cells.length, text: s.text },
    message: (_s, r) =>
      `${r.actual} tab-separated field(s), expected 3: "${r.text}"`,
    hint: "each spec STATUS row is `{id}<TAB>{phase}<TAB>{status}`",
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
  {
    id: "status-row.exp-shape",
    scope: "status-row",
    severity: "fail",
    when: isExperiment,
    check: (s) =>
      s.cells.length === 4 ? null : { actual: s.cells.length, text: s.text },
    message: (_s, r) =>
      `${r.actual} tab-separated field(s), expected 4: "${r.text}"`,
    hint: "each experiment row is `exp:{issue}<TAB>{state}<TAB>{pin}<TAB>{plan-ref}`",
  },
  {
    // An experiment-kind row is classified by its `exp:` id prefix
    // (scopes.js), so the spec `id-format` rule is skipped for it; this rule
    // enforces the `exp:\d+` id so a non-numeric issue (e.g. `exp:abc`) flags
    // rather than auditing clean — keeping the audit aligned with
    // STATUS_ID_REGEX / parseStatusRowId.
    id: "status-row.exp-id-format",
    scope: "status-row",
    severity: "fail",
    when: isExperiment,
    check: (s) => (/^exp:\d+$/.test(s.id) ? null : { id: s.id }),
    message: (_s, r) => `Bad experiment id '${r.id}' (expected exp:NNN)`,
    hint: "an experiment id is `exp:` followed by the issue number",
  },
  {
    id: "status-row.exp-state",
    scope: "status-row",
    severity: "fail",
    when: hasFourCells,
    check: (s) => (EXP_STATES.has(s.cells[1]) ? null : { state: s.cells[1] }),
    message: (_s, r) =>
      `Bad experiment state '${r.state}' (expected registered|approved|cancelled)`,
    hint: "experiment state is one of registered, approved, cancelled",
  },
  {
    id: "status-row.exp-pin",
    scope: "status-row",
    severity: "fail",
    when: hasFourCells,
    // The pin is decidable per state, with no "ever approved" inference: a
    // `registered` row has no pin (`-`); an `approved` row pins the 40-hex
    // head; a `cancelled` row may carry the retained pin or `-` (it may or may
    // not have been approved before cancellation), so both are accepted.
    check: (s) => {
      const [, state, pin] = s.cells;
      if (state === "registered") {
        return pin === "-" ? null : { state, pin, want: "-" };
      }
      if (state === "approved") {
        return PIN_RE.test(pin) ? null : { state, pin, want: "a 40-hex SHA" };
      }
      if (state === "cancelled") {
        return pin === "-" || PIN_RE.test(pin)
          ? null
          : { state, pin, want: "`-` or a 40-hex SHA" };
      }
      return null; // bad state already flagged by exp-state
    },
    message: (_s, r) =>
      `Bad pin '${r.pin}' for state '${r.state}' (expected ${r.want})`,
    hint: "registered pins `-`; approved pins a 40-hex SHA; cancelled pins either",
  },
  {
    id: "status-row.exp-planref",
    scope: "status-row",
    severity: "fail",
    when: hasFourCells,
    check: (s) => (/^#\d+$/.test(s.cells[3]) ? null : { planRef: s.cells[3] }),
    message: (_s, r) => `Bad plan-ref '${r.planRef}' (expected #NNN)`,
    hint: "the plan-ref names the issue carrying the execution plan, e.g. #NNN",
  },
];
