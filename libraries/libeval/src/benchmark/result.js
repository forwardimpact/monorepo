/**
 * Result-record schemas and runtime validators.
 *
 * Two schemas live here:
 *   - RESULT_RECORD_SCHEMA — one record per (task, runIndex) from a full
 *     benchmark run. Has a happy branch (scoring + judge present) and a
 *     pre-flight-failure branch (scoring/judgeVerdict/submission absent).
 *   - SCORING_RECORD_SCHEMA — narrower output of `benchmark-score` (P7):
 *     ad-hoc grading without a full lifecycle.
 *
 * Validation is throw-on-mismatch so the runner can wrap every JSONL append
 * in a guard and reject schema drift at write time.
 */

import { z } from "zod";

const VERDICT_ENUM = z.enum(["pass", "fail"]);

const SCORING_SHAPE = z.object({
  verdict: VERDICT_ENUM,
  details: z.array(z.unknown()),
  exitCode: z.number().int(),
});

const JUDGE_VERDICT_SHAPE = z.object({
  verdict: VERDICT_ENUM,
  summary: z.string(),
});

const PROFILES_SHAPE = z.object({
  agent: z.union([z.string(), z.null()]),
  supervisor: z.null(),
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
  turns: z.number().int().min(0),
  profiles: PROFILES_SHAPE,
  model: z.string(),
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
  scoring: SCORING_SHAPE,
  submission: z.string(),
  judgeVerdict: JUDGE_VERDICT_SHAPE,
  agentTracePath: z.string(),
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
  judgeTracePath: z.string(),
  scoring: z.undefined().optional(),
  submission: z.undefined().optional(),
  judgeVerdict: z.undefined().optional(),
  agentError: z.undefined().optional(),
});

export const RESULT_RECORD_SCHEMA = z.union([HAPPY_RECORD, PREFLIGHT_RECORD]);

export const SCORING_RECORD_SCHEMA = z.object({
  taskId: z.string().min(1),
  scoring: SCORING_SHAPE,
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
export function validateScoringRecord(record) {
  SCORING_RECORD_SCHEMA.parse(record);
}
