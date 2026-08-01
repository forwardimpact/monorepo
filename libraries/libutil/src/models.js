/**
 * Canonical Claude model identifiers, named by role. One home for every
 * model default in the monorepo. A model upgrade edits the values here
 * (plus any docs flagged by `.jidoka/invariants/model-defaults.rules.mjs`)
 * and nothing else.
 *
 * Markdown docs cannot import these constants, so the invariant script
 * cross-checks every model ID mentioned in docs and skills against the
 * values exported below.
 */

/**
 * Long-horizon agents under direct evaluation (eval sessions). The most
 * capable model with the 1M-context suffix.
 */
export const AGENT_MODEL = "claude-opus-4-8[1m]";

/**
 * Lead roles: supervisor, facilitator, discussion lead, benchmark
 * lead, and judge. Leads orchestrate whole multi-agent sessions, so
 * they get the most capable model with the 1M-context suffix. The
 * suffix is an Agent SDK identifier. Use CHAT_MODEL or FAST_MODEL for
 * direct Messages API calls.
 */
export const LEAD_MODEL = "claude-opus-4-8[1m]";

/**
 * Benchmark agent-under-test. A pinned reference model keeps pass@k
 * results comparable across runs. This is deliberately separate from
 * AGENT_MODEL. An upgrade of the agent tier must not silently move the
 * benchmark baseline.
 */
export const BENCHMARK_AGENT_MODEL = "claude-sonnet-4-6";

/**
 * Interactive chat (fit-guide) and direct Messages API calls. This model
 * gives the best speed/intelligence balance. It is valid both as an Agent
 * SDK and a raw API model ID.
 */
export const CHAT_MODEL = "claude-sonnet-4-6";

/**
 * Cheap mechanical tasks (wiki prose fixes, synthetic-data generation).
 * The fastest and most cost-effective model.
 */
export const FAST_MODEL = "claude-haiku-4-5";
