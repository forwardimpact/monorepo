// The reason grammar. One pipe-separated line names the writer, every breach,
// and the time, so an operator reads the cause out of the variable itself.

const KIND_ORDER = { unreadable: 0, uncovered: 0, threshold: 1 };

/**
 * Render one breach as its reason segment.
 * @param {{id: string, kind: string, count: ?number, threshold: ?number}} breach
 * @returns {string} The segment, for example `issues=47/32`.
 */
function encodeBreach(breach) {
  if (breach.kind === "threshold") {
    return `${breach.id}=${breach.count}/${breach.threshold}`;
  }
  return `${breach.id}=${breach.kind}`;
}

/**
 * Encode a latch reason. `unreadable` and `uncovered` breaches lead, then
 * `threshold` breaches, each group in the order the rules ran.
 * @param {object} input
 * @param {string} input.name - The writer's name, which leads the line.
 * @param {Array<object>} input.breaches - The breaches to name.
 * @param {string} input.at - The ISO timestamp that closes the line.
 * @returns {string} The encoded reason.
 */
export function encodeReason({ name, breaches = [], at }) {
  const ordered = breaches
    .map((breach, index) => ({ breach, index }))
    .sort(
      (a, b) =>
        (KIND_ORDER[a.breach.kind] ?? 1) - (KIND_ORDER[b.breach.kind] ?? 1) ||
        a.index - b.index,
    )
    .map(({ breach }) => encodeBreach(breach));
  return [name, ...ordered, at].join("|");
}

/**
 * Decode a reason this module encoded.
 * @param {*} value - The raw variable value.
 * @param {string} [name] - The writer name the line must lead with.
 * @returns {?{name: string, breaches: Array<object>, at: string}} The decoded
 *   reason, or `null` when the value does not start with the name segment.
 */
export function decodeReason(value, name = "watchdog") {
  if (typeof value !== "string") return null;
  const segments = value.split("|");
  if (segments.length < 2 || segments[0] !== name) return null;
  const at = segments[segments.length - 1];
  const breaches = segments.slice(1, -1).map((segment) => {
    const [id, detail = ""] = segment.split("=");
    if (detail === "unreadable" || detail === "uncovered") {
      return { id, kind: detail, count: null, threshold: null };
    }
    const [count, threshold] = detail.split("/");
    return {
      id,
      kind: "threshold",
      count: Number(count),
      threshold: Number(threshold),
    };
  });
  return { name, breaches, at };
}
