/**
 * Benchmark result-record schema (spec 870 design § Result-record schema).
 *
 * Two distinct shapes are validated here:
 *
 * - `RESULT_RECORD_SCHEMA` — one record per (taskId, runIndex) emitted by
 *   `BenchmarkRunner`. The discriminated union expresses the two end states:
 *   a happy-path record carrying scoring + judgeVerdict + submission, or a
 *   preflight-failure record with `preflightError` and no agent cost spent.
 * - `SCORING_RECORD_SCHEMA` — narrower record emitted by `benchmark-score`
 *   (per plan-a P7). The score subcommand is an ad-hoc grading path; it does
 *   not produce a full `ResultRecord` because there is no run context (no
 *   skill-set hash, no family revision, no agent trace).
 */

import { z } from "zod";

const VERDICT = z.enum(["pass", "fail"]);

const SCORING_PAYLOAD_SCHEMA = z.object({
  verdict: VERDICT,
  details: z.array(z.unknown()),
  exitCode: z.number().int(),
});

const JUDGE_VERDICT_SCHEMA = z.object({
  verdict: VERDICT,
  summary: z.string(),
});

const PROFILES_SCHEMA = z.object({
  agent: z.string().nullable(),
  supervisor: z.null(),
  judge: z.string().nullable(),
});

const COMMON_RECORD_FIELDS = {
  taskId: z.string().min(1),
  runIndex: z.number().int().min(0),
  costUsd: z.number(),
  turns: z.number().int().min(0),
  profiles: PROFILES_SCHEMA,
  model: z.string(),
  skillSetHash: z.string().regex(/^sha256:/),
  familyRevision: z.string().regex(/^(sha256|git):/),
  durationMs: z.number().int().min(0),
};

const HAPPY_RECORD_SCHEMA = z.object({
  ...COMMON_RECORD_FIELDS,
  verdict: VERDICT,
  scoring: SCORING_PAYLOAD_SCHEMA,
  judgeVerdict: JUDGE_VERDICT_SCHEMA,
  submission: z.string(),
  agentTracePath: z.string().min(1),
  judgeTracePath: z.string().min(1),
  preflightError: z.undefined().optional(),
});

const PREFLIGHT_FAILURE_RECORD_SCHEMA = z.object({
  ...COMMON_RECORD_FIELDS,
  verdict: z.literal("fail"),
  preflightError: z.object({
    phase: z.string(),
    message: z.string(),
    exitCode: z.number().int(),
  }),
  scoring: z.undefined().optional(),
  judgeVerdict: z.undefined().optional(),
  submission: z.undefined().optional(),
  agentTracePath: z.undefined().optional(),
  judgeTracePath: z.undefined().optional(),
});

export const RESULT_RECORD_SCHEMA = z.union([
  HAPPY_RECORD_SCHEMA,
  PREFLIGHT_FAILURE_RECORD_SCHEMA,
]);

export const SCORING_RECORD_SCHEMA = z.object({
  taskId: z.string().min(1),
  scoring: SCORING_PAYLOAD_SCHEMA,
  exitCode: z.number().int(),
});

/**
 * Validate a benchmark result record. Throws on schema mismatch.
 * @param {unknown} record
 * @returns {void}
 */
export function validateResultRecord(record) {
  RESULT_RECORD_SCHEMA.parse(record);
}

/**
 * Validate a scoring-only record (from `benchmark-score`). Throws on
 * schema mismatch.
 * @param {unknown} record
 * @returns {void}
 */
export function validateScoringRecord(record) {
  SCORING_RECORD_SCHEMA.parse(record);
}
