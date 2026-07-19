/**
 * Result-record schemas and runtime validators.
 *
 * Two schemas live here:
 *   - RESULT_RECORD_SCHEMA — one record per (task, runIndex) from a full
 *     benchmark run. Has a happy branch (grade + collectors + judge present)
 *     and a pre-flight-failure branch (grade/judgeVerdict/submission absent).
 *   - GRADE_RECORD_SCHEMA — narrower output of `benchmark-grade`: ad-hoc
 *     grading without a full lifecycle.
 *
 * The check rows are the authoritative grading channel: the happy branch
 * requires a `grade` object, so a pre-break record fails validation rather
 * than rendering under semantics it never carried.
 *
 * Validation is throw-on-mismatch so the runner can wrap every JSONL append
 * in a guard and reject schema drift at write time.
 */

import { z } from "zod";

const VERDICT_ENUM = z.enum(["pass", "fail"]);

const INVARIANTS_SHAPE = z.object({
  details: z.array(z.unknown()),
  exitCode: z.number().int(),
  stderr: z.string().optional(),
});

/**
 * The normalized grading projection: `score` appears only on scored tasks,
 * `malformed` only when at least one row was malformed.
 */
const GRADE_SHAPE = z.object({
  verdict: VERDICT_ENUM,
  gatesPass: z.boolean(),
  score: z.number().min(0).max(1).optional(),
  malformed: z.number().int().min(1).optional(),
});

const HIDDEN_TESTS_SHAPE = z.object({
  details: z.array(z.unknown()),
  error: z.string().optional(),
});

const JUDGE_VERDICT_SHAPE = z.object({
  verdict: VERDICT_ENUM,
  summary: z.string(),
});

/**
 * Per-participant cost attribution. `costUsd` is the sum of these; the
 * breakdown lets reports show where the spend went. The judge runs as its
 * own SDK session, so its cost is tracked separately from agent/supervisor.
 */
const COST_BREAKDOWN_SHAPE = z.object({
  agent: z.number(),
  supervisor: z.number(),
  judge: z.number(),
});

const PROFILES_SHAPE = z.object({
  agent: z.union([z.string(), z.null()]),
  supervisor: z.union([z.string(), z.null()]),
  judge: z.union([z.string(), z.null()]),
});

const PREFLIGHT_ERROR_SHAPE = z.object({
  phase: z.string(),
  message: z.string(),
  exitCode: z.number().int(),
});

const COMMON_FIELDS = {
  taskId: z.string().min(1),
  runIndex: z.number().int().min(0),
  verdict: VERDICT_ENUM,
  costUsd: z.number(),
  costBreakdown: COST_BREAKDOWN_SHAPE.optional(),
  turns: z.number().int().min(0),
  profiles: PROFILES_SHAPE,
  model: z.object({
    agent: z.string(),
    supervisor: z.string().optional(),
    judge: z.string().optional(),
  }),
  skillSetHash: z.string(),
  familyRevision: z.string(),
  durationMs: z.number().int().min(0),
};

const AGENT_ERROR_SHAPE = z.object({
  message: z.string(),
  aborted: z.boolean(),
});

const HAPPY_RECORD = z.object({
  ...COMMON_FIELDS,
  invariants: INVARIANTS_SHAPE,
  grade: GRADE_SHAPE,
  hiddenTests: HIDDEN_TESTS_SHAPE.optional(),
  // The effective, judge-zeroed score `report` aggregates — present only on
  // scored tasks.
  score: z.number().min(0).max(1).optional(),
  submission: z.string(),
  judgeVerdict: JUDGE_VERDICT_SHAPE.optional(),
  agentTracePath: z.string(),
  supervisorTracePath: z.string(),
  judgeTracePath: z.string(),
  agentError: AGENT_ERROR_SHAPE.optional(),
  preflightError: z.undefined().optional(),
});

const PREFLIGHT_RECORD = z.object({
  ...COMMON_FIELDS,
  costUsd: z.literal(0),
  preflightError: PREFLIGHT_ERROR_SHAPE,
  // Trace paths are populated even on preflight failure (the runner allocates
  // them in WorkdirManager.start) so the record is uniform across branches
  // and downstream consumers can reference them without conditional fields.
  agentTracePath: z.string(),
  supervisorTracePath: z.string(),
  judgeTracePath: z.string(),
  invariants: z.undefined().optional(),
  grade: z.undefined().optional(),
  hiddenTests: z.undefined().optional(),
  score: z.undefined().optional(),
  submission: z.undefined().optional(),
  judgeVerdict: z.undefined().optional(),
  agentError: z.undefined().optional(),
});

export const RESULT_RECORD_SCHEMA = z.union([HAPPY_RECORD, PREFLIGHT_RECORD]);

export const GRADE_RECORD_SCHEMA = z.object({
  taskId: z.string().min(1),
  grade: GRADE_SHAPE,
  invariants: INVARIANTS_SHAPE,
  hiddenTests: HIDDEN_TESTS_SHAPE.optional(),
  // Mirrors the invariants script's exit for diagnosis; the graded verdict
  // is what drives the command's process exit.
  exitCode: z.number().int(),
});

/**
 * Throw on schema mismatch.
 * @param {object} record
 */
export function validateResultRecord(record) {
  RESULT_RECORD_SCHEMA.parse(record);
}

/**
 * Throw on schema mismatch.
 * @param {object} record
 */
export function validateGradeRecord(record) {
  GRADE_RECORD_SCHEMA.parse(record);
}
