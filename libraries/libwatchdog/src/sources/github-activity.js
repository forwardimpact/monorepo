// The four activity probes. Each counts one signal against one cutoff and
// reports whether the response covers the whole window. A probe throws when
// it cannot read, and the engine turns that throw into an `unreadable` breach.

const PAGE = 100;

/**
 * Count the page items at or after the cutoff, and report window coverage.
 * A full page whose oldest item still sits inside the window hides older
 * qualifying items, so it reports `covered: false`. Coverage reads the raw
 * page, never the filtered set.
 * @param {Array<object>} page - The raw response array.
 * @param {(item: object) => string} timestampOf - Reads an item's timestamp.
 * @param {string} cutoff - The ISO cutoff.
 * @param {object} [options]
 * @param {boolean} [options.timestampEscape] - Allow a full page to count as
 *   covered when its oldest item predates the cutoff.
 * @param {(item: object) => boolean} [options.keep] - Extra count filter.
 * @returns {{count: number, covered: boolean}} The count and the coverage.
 */
function tally(
  page,
  timestampOf,
  cutoff,
  { timestampEscape = true, keep } = {},
) {
  const at = Date.parse(cutoff);
  const counted = page.filter(
    (item) => Date.parse(timestampOf(item)) >= at && (keep ? keep(item) : true),
  );
  const oldest = page.reduce(
    (min, item) => Math.min(min, Date.parse(timestampOf(item))),
    Number.POSITIVE_INFINITY,
  );
  const covered = page.length < PAGE || (timestampEscape && oldest < at);
  return { count: counted.length, covered };
}

/**
 * Count default-branch commits created inside the window.
 * @param {object} input
 * @param {Function} input.request - The REST request function.
 * @param {string} input.repo - `owner/repo`.
 * @param {string} input.defaultBranch - The branch the commits sit on.
 * @param {string} input.cutoff - The ISO cutoff.
 * @returns {Promise<{count: number, covered: boolean}>} The probe reading.
 */
export async function commitsProbe({ request, repo, defaultBranch, cutoff }) {
  const path =
    `/repos/${repo}/commits?sha=${encodeURIComponent(defaultBranch)}` +
    `&since=${encodeURIComponent(cutoff)}&per_page=${PAGE}`;
  const page = (await request(path)).body;
  // `since` filters server-side, so no returned commit predates the cutoff
  // and the timestamp escape can never fire.
  return tally(page, (item) => item.commit.committer.date, cutoff, {
    timestampEscape: false,
  });
}

/**
 * Count pull requests created inside the window.
 * @param {object} input
 * @param {Function} input.request - The REST request function.
 * @param {string} input.repo - `owner/repo`.
 * @param {string} input.cutoff - The ISO cutoff.
 * @returns {Promise<{count: number, covered: boolean}>} The probe reading.
 */
export async function pullsProbe({ request, repo, cutoff }) {
  const path = `/repos/${repo}/pulls?state=all&sort=created&direction=desc&per_page=${PAGE}`;
  const page = (await request(path)).body;
  return tally(page, (item) => item.created_at, cutoff);
}

/**
 * Count issues created inside the window, excluding pull requests.
 * @param {object} input
 * @param {Function} input.request - The REST request function.
 * @param {string} input.repo - `owner/repo`.
 * @param {string} input.cutoff - The ISO cutoff.
 * @returns {Promise<{count: number, covered: boolean}>} The probe reading.
 */
export async function issuesProbe({ request, repo, cutoff }) {
  const path = `/repos/${repo}/issues?state=all&sort=created&direction=desc&per_page=${PAGE}`;
  const page = (await request(path)).body;
  return tally(page, (item) => item.created_at, cutoff, {
    keep: (item) => !item.pull_request,
  });
}

/**
 * Count issue and pull-request conversation comments created inside the
 * window.
 * @param {object} input
 * @param {Function} input.request - The REST request function.
 * @param {string} input.repo - `owner/repo`.
 * @param {string} input.cutoff - The ISO cutoff.
 * @returns {Promise<{count: number, covered: boolean}>} The probe reading.
 */
export async function commentsProbe({ request, repo, cutoff }) {
  const path =
    `/repos/${repo}/issues/comments?since=${encodeURIComponent(cutoff)}` +
    `&sort=created&direction=desc&per_page=${PAGE}`;
  const page = (await request(path)).body;
  // `since` filters `updated_at` while the count reads `created_at`, so an
  // old comment edited inside the window occupies a page slot and sorts last.
  // The timestamp escape would read that as covered while newer qualifying
  // comments stayed hidden behind the page, so this probe drops it.
  return tally(page, (item) => item.created_at, cutoff, {
    timestampEscape: false,
  });
}
