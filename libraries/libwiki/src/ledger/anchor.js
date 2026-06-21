/**
 * Allocation-anchor body format for the parallel-collision ledger. An anchor is
 * an append-only comment on the obstacle issue, so its identity is durable
 * independent of the merge-contested ledger page. Each anchor carries one
 * fenced block:
 *
 * ```text
 * ```yaml alloc
 * kind: occ
 * ids: ["#97", "#98"]
 * event: 7d0f8bca
 * note: dual-execution episode
 * ```
 * ```
 *
 * The block is parsed by structure, not by a general YAML engine, so libwiki
 * adds no parser dependency. `kind` is one of `occ`, `nm`, `fold`, `meta`;
 * `ids` is a list of display labels; `event` is the durable key (a SHA or a
 * prior anchor id); `note` is free text. The durable key is `event`; labels are
 * display only, so relabeling is lossless.
 */

const FENCE_OPEN = "```yaml alloc";
const FENCE_CLOSE = "```";
const KINDS = new Set(["occ", "nm", "fold", "meta"]);

/**
 * Parse the allocation anchor out of a comment body, or `null` when the body
 * carries no `yaml alloc` fenced block.
 *
 * @param {string} body - The full comment body.
 * @returns {{kind: string, ids: string[], event: string, note: string} | null}
 */
export function parseAnchor(body) {
  if (typeof body !== "string") return null;
  const lines = body.split("\n");
  const open = lines.findIndex((l) => l.trim() === FENCE_OPEN);
  if (open === -1) return null;
  const rest = lines.slice(open + 1);
  const close = rest.findIndex((l) => l.trim() === FENCE_CLOSE);
  if (close === -1) return null;
  const block = rest.slice(0, close);

  const fields = {};
  for (const line of block) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    fields[key] = value;
  }

  const kind = fields.kind;
  if (!KINDS.has(kind)) return null;
  const ids = parseIdList(fields.ids);
  const event = fields.event ?? "";
  if (event === "") return null;
  return { kind, ids, event, note: fields.note ?? "" };
}

/**
 * Render the canonical anchor body for posting.
 *
 * @param {{kind: string, ids: string[], event: string, note?: string}} anchor
 * @returns {string}
 */
export function renderAnchorBody({ kind, ids, event, note = "" }) {
  if (!KINDS.has(kind)) {
    throw new Error(`renderAnchorBody: unknown kind "${kind}"`);
  }
  const lines = [
    FENCE_OPEN,
    `kind: ${kind}`,
    `ids: ${renderIdList(ids)}`,
    `event: ${event}`,
  ];
  if (note) lines.push(`note: ${note}`);
  lines.push(FENCE_CLOSE);
  return lines.join("\n");
}

/** The set of valid kinds. */
export const ANCHOR_KINDS = KINDS;

function parseIdList(raw) {
  if (!raw) return [];
  const inner = raw.replace(/^\[/, "").replace(/\]$/, "");
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^["']/, "").replace(/["']$/, ""))
    .filter(Boolean);
}

function renderIdList(ids) {
  return `[${(ids ?? []).map((id) => `"${id}"`).join(", ")}]`;
}
