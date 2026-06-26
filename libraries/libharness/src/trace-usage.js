/**
 * Token-usage accounting for structured trace documents.
 *
 * `stats()` reports totals that name their population: result-event sums when
 * the trace carries them (authoritative), the per-message fallback otherwise,
 * or the carried last-wins summary for a pre-change document. These helpers
 * compute the per-message accounting and surface any divergence against the
 * result-event sums so a mismatch is reported, never silently absorbed.
 */

/** Zero-valued token usage, used as the carried-document fallback. */
export const ZERO_USAGE = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
};

/**
 * Per-stream-event breakdown for a pre-change document, labeled as carried —
 * old documents lack message identity, so rows stay keyed by turn index.
 * @param {object[]} turns
 * @returns {object[]}
 */
export function carriedPerTurn(turns) {
  const perTurn = [];
  for (const turn of turns) {
    if (turn.role !== "assistant" || !turn.usage) continue;
    perTurn.push({
      index: turn.index,
      inputTokens: turn.usage.inputTokens ?? 0,
      outputTokens: turn.usage.outputTokens ?? 0,
      cacheReadInputTokens: turn.usage.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: turn.usage.cacheCreationInputTokens ?? 0,
      population: "carried-document-per-turn",
    });
  }
  return perTurn;
}

/**
 * Whether a structured-document version predates per-message accounting
 * (1.2.0). A trace with no version (collected by this build from NDJSON) is
 * not pre-change. Compares numeric version parts so 1.10.0 reads as post-change.
 * @param {string|undefined|null} version
 * @returns {boolean}
 */
export function isPreChangeDoc(version) {
  if (typeof version !== "string") return false;
  const [major = 0, minor = 0] = version
    .split(".")
    .map((part) => parseInt(part, 10) || 0);
  if (major !== 1) return major < 1;
  // Per-message accounting arrived in 1.2.0; any 1.2.x is post-change.
  return minor < 2;
}

/**
 * Account assistant usage once per API message. Turns are grouped by
 * `messageId` (a null id is its own singleton message); per message the
 * field-wise max across its snapshots is taken — order-insensitive, equal to
 * the single value when a message's duplicate snapshots are byte-identical
 * (zero residual against result-event sums), and a floor for output (the
 * largest streaming snapshot, never an overstatement).
 * @param {object[]} turns
 * @returns {{perMessage: object[], totals: object}}
 */
export function perMessageUsage(turns) {
  const byMessage = new Map();
  let singletonSeq = 0;

  for (const turn of turns) {
    if (turn.role !== "assistant" || !turn.usage) continue;
    const key = turn.messageId ?? `__null__${singletonSeq++}`;
    accumulateMessage(byMessage, key, turn);
  }

  const totals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
  };
  const perMessage = [];
  for (const row of byMessage.values()) {
    totals.inputTokens += row.inputTokens;
    totals.outputTokens += row.outputTokens;
    totals.cacheReadInputTokens += row.cacheReadInputTokens;
    totals.cacheCreationInputTokens += row.cacheCreationInputTokens;
    perMessage.push({
      ...row,
      outputIsStreamingSnapshot: true,
      population: "api-message",
    });
  }
  return { perMessage, totals };
}

/**
 * Fold one assistant turn's usage into its message bucket by field-wise max.
 * @param {Map<string, object>} byMessage
 * @param {string} key
 * @param {object} turn
 */
function accumulateMessage(byMessage, key, turn) {
  const u = turn.usage;
  const prev = byMessage.get(key);
  if (!prev) {
    byMessage.set(key, {
      messageId: turn.messageId ?? null,
      inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
      cacheReadInputTokens: u.cacheReadInputTokens ?? 0,
      cacheCreationInputTokens: u.cacheCreationInputTokens ?? 0,
    });
    return;
  }
  prev.inputTokens = Math.max(prev.inputTokens, u.inputTokens ?? 0);
  prev.outputTokens = Math.max(prev.outputTokens, u.outputTokens ?? 0);
  prev.cacheReadInputTokens = Math.max(
    prev.cacheReadInputTokens,
    u.cacheReadInputTokens ?? 0,
  );
  prev.cacheCreationInputTokens = Math.max(
    prev.cacheCreationInputTokens,
    u.cacheCreationInputTokens ?? 0,
  );
}

/**
 * Compare per-message sums against the result-event sums on the fields the
 * spec guarantees parity for (input, cacheRead, cacheCreation — never output,
 * which always diverges by mechanism 2). Returns the first divergent field as
 * `{field, perMessageSum, resultEventSum}`, or null when all agree.
 * @param {object} perMessageTotals
 * @param {object} resultEventUsage
 * @returns {object|null}
 */
export function computeDivergence(perMessageTotals, resultEventUsage) {
  for (const field of [
    "inputTokens",
    "cacheReadInputTokens",
    "cacheCreationInputTokens",
  ]) {
    const perMessageSum = perMessageTotals[field] ?? 0;
    const resultEventSum = resultEventUsage[field] ?? 0;
    if (perMessageSum !== resultEventSum) {
      return { field, perMessageSum, resultEventSum };
    }
  }
  return null;
}

/** Sentinel bucket name for assistant turns that ran no tool call. */
const NO_TOOL = "(no-tool)";

/**
 * Attribute per-turn usage to per-tool buckets: each `tool_use` block gets an
 * equal share of its host turn's usage; assistant turns with no `tool_use`
 * block contribute full usage to the `(no-tool)` bucket.
 * @param {object[]} turns
 * @returns {{buckets: Map<string, {inputTokens: number, outputTokens: number}>, bucketTurns: Map<string, Set<number>>}}
 */
export function bucketUsageByTool(turns) {
  const buckets = new Map();
  const bucketTurns = new Map();
  const ensure = (name) => {
    if (!buckets.has(name)) {
      buckets.set(name, { inputTokens: 0, outputTokens: 0 });
      bucketTurns.set(name, new Set());
    }
    return buckets.get(name);
  };

  for (const turn of turns) {
    if (turn.role !== "assistant" || !turn.usage) continue;
    const input = turn.usage.inputTokens ?? 0;
    const output = turn.usage.outputTokens ?? 0;
    const toolBlocks = turn.content.filter((b) => b.type === "tool_use");
    const targets = toolBlocks.length === 0 ? [NO_TOOL] : toolBlocks;
    const shareIn = input / targets.length;
    const shareOut = output / targets.length;
    for (const target of targets) {
      const name = typeof target === "string" ? target : target.name;
      const bucket = ensure(name);
      bucket.inputTokens += shareIn;
      bucket.outputTokens += shareOut;
      bucketTurns.get(name).add(turn.index);
    }
  }
  return { buckets, bucketTurns };
}

/**
 * Scale per-tool buckets onto the headline totals so the input, output, and
 * `costShare` columns each sum to the corresponding `totals` value (and 1.0)
 * exactly, regardless of population (result-event-sum, per-message-fallback, or
 * carried-document). The largest bucket absorbs the rounding residual on each
 * axis (criterion-6 invariant).
 * @param {Map<string, {inputTokens: number, outputTokens: number}>} buckets
 * @param {Map<string, Set<number>>} bucketTurns
 * @param {object} totals
 * @returns {Array<{tool: string, turns: number, inputTokens: number, outputTokens: number, costShare: number}>}
 */
export function reconcileBucketsToTotals(buckets, bucketTurns, totals) {
  const rawIn = sumField(buckets, "inputTokens");
  const rawOut = sumField(buckets, "outputTokens");
  const scaleIn = rawIn === 0 ? 0 : (totals.inputTokens ?? 0) / rawIn;
  const scaleOut = rawOut === 0 ? 0 : (totals.outputTokens ?? 0) / rawOut;
  for (const b of buckets.values()) {
    b.inputTokens *= scaleIn;
    b.outputTokens *= scaleOut;
  }

  const totalTokens =
    sumField(buckets, "inputTokens") + sumField(buckets, "outputTokens");
  const perTool = [...buckets.entries()].map(([tool, b]) => ({
    tool,
    turns: bucketTurns.get(tool).size,
    inputTokens: b.inputTokens,
    outputTokens: b.outputTokens,
    costShare:
      totalTokens === 0 ? 0 : (b.inputTokens + b.outputTokens) / totalTokens,
  }));
  perTool.sort(
    (x, y) => y.costShare - x.costShare || x.tool.localeCompare(y.tool),
  );

  if (perTool.length > 0) {
    const top = perTool[0];
    const sum = (field) => perTool.reduce((s, r) => s + r[field], 0);
    top.inputTokens += (totals.inputTokens ?? 0) - sum("inputTokens");
    top.outputTokens += (totals.outputTokens ?? 0) - sum("outputTokens");
    top.costShare += 1 - sum("costShare");
  }
  return perTool;
}

/**
 * Sum one numeric field across every bucket value.
 * @param {Map<string, object>} buckets
 * @param {string} field
 * @returns {number}
 */
function sumField(buckets, field) {
  let total = 0;
  for (const b of buckets.values()) total += b[field];
  return total;
}
