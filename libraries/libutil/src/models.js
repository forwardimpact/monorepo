/**
 * Canonical Claude model identifiers, named by role. One home for every
 * model default in the monorepo — a model upgrade edits the values here
 * (plus any docs flagged by `scripts/check-model-defaults.mjs`) and
 * nothing else.
 *
 * Markdown docs cannot import these constants, so the invariant script
 * cross-checks every model ID mentioned in docs and skills against the
 * values exported below.
 */

/**
 * Long-horizon agent and lead roles (eval sessions, facilitation,
 * supervision) — most capable model with the 1M-context suffix.
 */
export const AGENT_MODEL = "claude-fable-5[1m]";

/**
 * Benchmark lead and judge roles — same family as AGENT_MODEL, standard
 * context window (benchmark sessions are short).
 */
export const LEAD_MODEL = "claude-fable-5";

/**
 * Benchmark agent-under-test — a pinned reference model so pass@k
 * results stay comparable across runs. Deliberately separate from
 * AGENT_MODEL: upgrading the agent tier must not silently move the
 * benchmark baseline.
 */
export const BENCHMARK_AGENT_MODEL = "claude-sonnet-4-6";

/** Interactive chat (fit-guide) — best speed/intelligence balance. */
export const CHAT_MODEL = "claude-sonnet-4-6";

/**
 * Cheap mechanical tasks (wiki prose fixes, synthetic-data generation)
 * — fastest and most cost-effective model.
 */
export const FAST_MODEL = "claude-haiku-4-5";
