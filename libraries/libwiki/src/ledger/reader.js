import { parseAnchor } from "./anchor.js";

/**
 * The obstacle issue whose comment thread is the allocation-anchor surface.
 * GitHub serializes comment creation and assigns a monotonic `id`, so that `id`
 * order is the allocation serialization no merge can erase.
 */
export const DEFAULT_ANCHOR_ISSUE = 1564;

/**
 * Read every allocation anchor from the obstacle issue's comment thread, in
 * server `id` order ascending. The lowest comment `id` claiming a given label
 * is its winner (first published wins). Comments carrying no anchor block are
 * skipped.
 *
 * @param {object} ghClient - A GhClient (or mock) exposing `apiGetPaginated`.
 * @param {object} opts
 * @param {string} opts.owner - Repository owner.
 * @param {string} opts.repo - Repository name.
 * @param {number} [opts.issue] - Issue number (defaults to the obstacle issue).
 * @param {string} [opts.cwd] - Working directory for the gh invocation.
 * @returns {Promise<Array<{id: number, createdAt: string, anchor: object}>>}
 */
export async function readAnchors(
  ghClient,
  { owner, repo, issue = DEFAULT_ANCHOR_ISSUE, cwd } = {},
) {
  if (!owner || !repo) {
    throw new Error("readAnchors: owner and repo are required");
  }
  const path = `repos/${owner}/${repo}/issues/${issue}/comments`;
  const comments = await ghClient.apiGetPaginated(path, { cwd });
  const anchors = [];
  for (const comment of comments ?? []) {
    const anchor = parseAnchor(comment.body ?? "");
    if (!anchor) continue;
    anchors.push({
      id: comment.id,
      createdAt: comment.created_at,
      anchor,
    });
  }
  anchors.sort((a, b) => a.id - b.id);
  return anchors;
}
