/**
 * Fold the ordered allocation-anchor sequence into id assignments. Then render
 * the two derived projections: the ledger page body and the MEMORY
 * cross-cutting row. The anchor record is authoritative. These projections
 * hold no sole-copy state, and a rebuild recreates them from the record. So an
 * erased projection is a cache miss that a rebuild repairs. It is not a loss
 * event.
 *
 * Identity is the `event` key. Labels are display output. So a
 * double-allocation resolves first-published-wins. The loser takes a new
 * label, and no record is lost. The `labelMode` parameter sets the label
 * policy. `renumber` is the default and matches the team's established
 * convention. It keeps the labels dense and re-mints the loser at the next
 * free index. `gapped` leaves a gap so a label never moves. The code supports
 * both. It forces neither.
 */

/**
 * @typedef {object} AnchorRecord
 * @property {number} id - The comment id (the serialization key).
 * @property {string} createdAt
 * @property {{kind: string, ids: string[], event: string, note: string}} anchor
 */

/**
 * Fold anchors into assignments and conflicts. First-published (lowest comment
 * `id`) wins each contested label.
 *
 * @param {AnchorRecord[]} anchors - Anchors in ascending `id` order.
 * @returns {{assignments: Map<string, AnchorRecord>, conflicts: Array<{label: string, winner: AnchorRecord, losers: AnchorRecord[]}>}}
 */
export function foldAnchors(anchors) {
  const assignments = new Map();
  const contested = new Map();
  for (const record of anchors) {
    for (const label of record.anchor.ids) {
      const existing = assignments.get(label);
      if (!existing) {
        assignments.set(label, record);
        continue;
      }
      // the existing record is older (anchors are id-ordered), so it wins.
      if (!contested.has(label)) contested.set(label, []);
      contested.get(label).push(record);
    }
  }
  const conflicts = [...contested.entries()].map(([label, losers]) => ({
    label,
    winner: assignments.get(label),
    losers,
  }));
  return { assignments, conflicts };
}

/**
 * Render the ledger page body from a fold. The renderer groups entries by kind
 * and orders them by the id of the anchor that won. It re-emits authored prose
 * from `<!-- anchor:ID -->`-cited blocks in anchor-id order. The returned
 * `missingProse` list names any cited anchor that does not exist. The renderer
 * never drops one silently. `labelMode` selects the re-mint guidance for the
 * loser of a double-allocation. `renumber` (default) re-mints at the next free
 * index. `gapped` leaves the loser's index as a gap.
 *
 * @param {{assignments: Map, conflicts: Array}} fold
 * @param {Array<{anchorId: number, text: string}>} [prose] - Anchor-cited prose blocks.
 * @param {{labelMode?: "renumber" | "gapped"}} [opts]
 * @returns {{body: string, missingProse: number[]}}
 */
export function renderLedgerPage(
  fold,
  prose = [],
  { labelMode = "renumber" } = {},
) {
  const lines = [
    "# Parallel-Collision Ledger",
    "",
    "Derived projection of the allocation-anchor record. `gemba-wiki ledger rebuild` rebuilds it. Do not hand-edit identifiers here. Allocate at an anchor.",
    "",
    ...renderKindSections(fold),
    ...renderConflicts(fold, labelMode),
  ];
  const missingProse = appendProse(lines, fold, prose);
  return { body: `${lines.join("\n").trimEnd()}\n`, missingProse };
}

function renderKindSections(fold) {
  const byKind = { occ: [], nm: [], fold: [], meta: [] };
  for (const [label, record] of fold.assignments) {
    byKind[record.anchor.kind]?.push({ label, record });
  }
  const lines = [];
  for (const [kind, heading] of KIND_HEADINGS) {
    byKind[kind].sort((a, b) => a.record.id - b.record.id);
    lines.push(`## ${heading}`, "");
    for (const { label, record } of byKind[kind]) {
      const note = record.anchor.note ? ` — ${record.anchor.note}` : "";
      lines.push(`- ${label} (event ${record.anchor.event})${note}`);
    }
    lines.push("");
  }
  return lines;
}

function renderConflicts(fold, labelMode) {
  if (fold.conflicts.length === 0) return [];
  const guidance =
    labelMode === "gapped"
      ? "leave the contested index as a gap"
      : "re-mint the loser at the next free index";
  const lines = [
    `## Double-allocations (first-published wins; ${guidance})`,
    "",
  ];
  for (const c of fold.conflicts) {
    const losers = c.losers
      .map((l) => `${l.anchor.event} (id ${l.id})`)
      .join(", ");
    lines.push(
      `- ${c.label}: winner ${c.winner.anchor.event} (id ${c.winner.id}); re-mint required for ${losers}`,
    );
  }
  lines.push("");
  return lines;
}

/**
 * Extract `<!-- anchor:ID -->`-cited prose blocks from an existing ledger-page
 * body so a rebuild re-emits them. A rebuild does not drop them. Each block
 * runs from its citation marker to the next marker or end of input.
 *
 * @param {string} pageBody - The current ledger-page text.
 * @returns {Array<{anchorId: number, text: string}>}
 */
export function extractProse(pageBody) {
  if (!pageBody) return [];
  const marker = /<!--\s*anchor:(\d+)\s*-->\n?/g;
  const blocks = [];
  let match = marker.exec(pageBody);
  while (match) {
    const anchorId = Number.parseInt(match[1], 10);
    const start = match.index + match[0].length;
    const next = marker.exec(pageBody);
    const end = next ? next.index : pageBody.length;
    const text = pageBody.slice(start, end).trim();
    if (text) blocks.push({ anchorId, text });
    match = next;
  }
  return blocks;
}

function appendProse(lines, fold, prose) {
  const missingProse = [];
  const knownIds = new Set([...fold.assignments.values()].map((r) => r.id));
  const ordered = [...prose].sort((a, b) => a.anchorId - b.anchorId);
  if (ordered.length === 0) return missingProse;
  lines.push("## Conventions and floors (binding)", "");
  for (const block of ordered) {
    if (!knownIds.has(block.anchorId)) missingProse.push(block.anchorId);
    lines.push(`<!-- anchor:${block.anchorId} -->`, block.text, "");
  }
  return missingProse;
}

/**
 * Render the MEMORY cross-cutting row counters from a fold. The counters are
 * the next-free index per kind, plus the total assigned count.
 *
 * @param {{assignments: Map}} fold
 * @returns {string}
 */
export function renderMemoryRow(fold) {
  const next = {
    occ: nextFree(fold, "occ", "#"),
    nm: nextFree(fold, "nm", "NM"),
    fold: nextFree(fold, "fold", "n="),
    meta: nextFree(fold, "meta", "M"),
  };
  return (
    `Parallel-collision allocation (derived from the anchor record): ` +
    `${fold.assignments.size} ids assigned; next free #${next.occ}, NM${next.nm}, ` +
    `n=${next.fold}, M${next.meta}. Allocate at an anchor. Never allocate by editing this row.`
  );
}

const MEMORY_REGION_OPEN = "<!-- ledger:memory-row -->";
const MEMORY_REGION_CLOSE = "<!-- /ledger:memory-row -->";
const MEMORY_REGION_RE = new RegExp(
  `${MEMORY_REGION_OPEN}\\n[\\s\\S]*?\\n${MEMORY_REGION_CLOSE}`,
);

/**
 * Write the derived MEMORY-row counters into a delimited region of a MEMORY.md
 * body. The row is then a rebuildable projection of the anchor record. The
 * write does not overwrite the surrounding authored narrative. The region is
 * the only sole-copy-free surface. This function regenerates its interior in
 * full. It preserves everything outside the region byte-for-byte. If the
 * region is absent, this function appends it under a heading. If the region is
 * present, this function replaces only its interior.
 *
 * @param {string} memoryBody - Current `MEMORY.md` text.
 * @param {{assignments: Map}} fold
 * @returns {string} The updated body.
 */
export function writeMemoryRowRegion(memoryBody, fold) {
  const region = `${MEMORY_REGION_OPEN}\n${renderMemoryRow(fold)}\n${MEMORY_REGION_CLOSE}`;
  const body = memoryBody ?? "";
  if (MEMORY_REGION_RE.test(body)) {
    return body.replace(MEMORY_REGION_RE, region);
  }
  const trimmed = body.trimEnd();
  return `${trimmed}${trimmed ? "\n\n" : ""}${region}\n`;
}

/**
 * Extract the derived MEMORY-row region interior from a MEMORY.md body, or
 * `null` if the region is absent. `verify` uses this to diff the projection
 * surface alone. It never diffs the surrounding narrative.
 *
 * @param {string} memoryBody
 * @returns {string|null}
 */
export function readMemoryRowRegion(memoryBody) {
  const m = (memoryBody ?? "").match(MEMORY_REGION_RE);
  if (!m) return null;
  return m[0]
    .replace(`${MEMORY_REGION_OPEN}\n`, "")
    .replace(`\n${MEMORY_REGION_CLOSE}`, "");
}

const KIND_HEADINGS = [
  ["occ", "Occurrences"],
  ["nm", "Near-misses"],
  ["fold", "Folds"],
  ["meta", "Meta-instances"],
];

function nextFree(fold, kind, prefix) {
  let max = 0;
  for (const [label, record] of fold.assignments) {
    if (record.anchor.kind !== kind) continue;
    const n = Number.parseInt(label.replace(prefix, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}
