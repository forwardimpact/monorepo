import { isoTimestamp } from "@forwardimpact/libutil";
import { SESSION_GAP_MS } from "./constants.js";
import { isLaneFile, enumerateLaneFiles } from "./lane-files.js";

/**
 * Normalize a content line for content-keyed presence. Strip a trailing CR and
 * trailing whitespace. A blank line normalizes to "". Callers drop it.
 * @param {string} line
 * @returns {string}
 */
export function normLine(line) {
  return line.replace(/\r$/, "").replace(/\s+$/, "");
}

/**
 * Parse `git diff --unified=0` text into per-file change records. Attribute
 * each `+`/`-` line to the file named by the most recent `+++ b/<path>` header.
 * The `+++`/`---`/`@@` framing lines are not content. The parser keeps
 * `/dev/null` targets (pure deletions) as the home for their removed lines.
 * @param {string} diffText
 * @returns {Array<{home: string, added: string[], removed: string[]}>}
 */
export function parseDiff(diffText) {
  const byHome = new Map();
  let home = null;
  for (const raw of diffText.split("\n")) {
    if (raw.startsWith("+++ ")) {
      home = stripDiffTarget(raw.slice(4));
      continue;
    }
    if (home === null || isDiffFraming(raw)) continue;
    const rec = byHome.get(home) ?? { home, added: [], removed: [] };
    if (raw.startsWith("+")) rec.added.push(raw.slice(1));
    else if (raw.startsWith("-")) rec.removed.push(raw.slice(1));
    else continue;
    byHome.set(home, rec);
  }
  return [...byHome.values()];
}

/** Whether a diff line is framing (`---`, `@@`, `diff`, `index`) and carries no content. */
function isDiffFraming(raw) {
  return (
    raw.startsWith("--- ") ||
    raw.startsWith("@@") ||
    raw.startsWith("diff ") ||
    raw.startsWith("index ")
  );
}

/** Strip a diff target's `a/`/`b/` prefix. `/dev/null` stays as-is. */
function stripDiffTarget(target) {
  const t = target.trim();
  if (t === "/dev/null") return t;
  return t.replace(/^[ab]\//, "");
}

/**
 * Compose a window of change records (oldest→newest) into the surviving
 * addition assertions. Then return those absent from the tip. The composition
 * is content-keyed on `norm(line)`. A later own-lane deletion of an
 * earlier-added line cancels its assertion (additions-only, own-deletions
 * cancel). A surviving assertion is present iff its normalized line appears
 * anywhere in `tipText`.
 *
 * @param {Array<{home: string, added: string[], removed: string[]}>} changes
 *   Window changes, oldest→newest.
 * @param {string} tipText - Concatenated text of the tip's in-scope files.
 * @param {(line: string) => string} norm - Line normalizer.
 * @returns {Array<{contentId: string, pushHome: string}>} Absent assertions.
 */
export function findAbsent(changes, tipText, norm) {
  const asserted = composeAssertions(changes, norm);
  const present = normalizedKeySet(tipText, norm);
  const absent = [];
  for (const [key, a] of asserted) {
    if (!present.has(key)) absent.push(a);
  }
  return absent;
}

/** Compose window changes into surviving additions; a later removal cancels its key. */
function composeAssertions(changes, norm) {
  const asserted = new Map(); // norm(line) -> { contentId, pushHome }
  for (const change of changes) {
    for (const line of change.added) {
      const key = norm(line);
      if (key !== "" && !asserted.has(key)) {
        asserted.set(key, { contentId: key, pushHome: change.home });
      }
    }
    for (const line of change.removed) {
      const key = norm(line);
      if (key !== "") asserted.delete(key);
    }
  }
  return asserted;
}

/** The set of non-blank normalized lines in `text`. */
function normalizedKeySet(text, norm) {
  const set = new Set();
  for (const line of text.split("\n")) {
    const key = norm(line);
    if (key !== "") set.add(key);
  }
  return set;
}

/**
 * Resolve the previous-session push set from lane-authored commits (newest
 * first) by idle-gap. Tier 2 runs at boot before the current session pushes,
 * so the most recent contiguous run is the previous session. The result is
 * vacuous only for empty history. {@link sweepTier2} raises the degenerate
 * (content-unresolvable) case. This function does not raise it.
 *
 * @param {Array<{sha: string, when: number}>} commits - Newest first.
 * @param {number} gapMs - Idle-gap threshold (ms).
 * @returns {{kind: "vacuous"} | {kind: "window", commits: Array<{sha: string, when: number}>}}
 */
export function previousSessionWindow(commits, gapMs) {
  if (commits.length === 0) return { kind: "vacuous" };
  const tipRun = [commits[0]];
  for (let i = 1; i < commits.length; i++) {
    // commits are newest-first. `when` is seconds. The gap threshold is ms.
    const gap = (commits[i - 1].when - commits[i].when) * 1000;
    if (gap > gapMs) break;
    tipRun.push(commits[i]);
  }
  return { kind: "window", commits: tipRun };
}

/**
 * Build a detection record. `detectedAt` is the binding wall-clock stamp
 * (ISO). An exposure figure derived from commit timestamps carries the labeled
 * `commit-timestamp` fallback basis.
 *
 * @param {object} d
 * @param {1|2} d.tier
 * @param {string} d.contentId - The absent content's identity (normalized line).
 * @param {string} d.pushHome - The content's push-time home path.
 * @param {number|Date} d.now - Wall-clock (e.g. `runtime.clock.now()` ms).
 * @param {number} [d.exposureSeconds] - Commit-timestamp-derived exposure.
 * @returns {object}
 */
export function makeDetection({
  tier,
  contentId,
  pushHome,
  now,
  exposureSeconds,
}) {
  const detection = {
    tier,
    contentId,
    pushHome,
    detectedAt: isoTimestamp(now),
  };
  if (exposureSeconds != null) {
    detection.exposure = {
      seconds: exposureSeconds,
      basis: "commit-timestamp",
    };
  }
  return detection;
}

/**
 * Render detections to flow output text. Empty input renders the empty string
 * (clean-path silence). Each detection gets one line that names the tier, the
 * push-time home, and the content identity. The line labels exposure with its
 * fallback basis when exposure is present.
 * @param {object[]} detections
 * @returns {string}
 */
export function renderDetections(detections) {
  if (detections.length === 0) return "";
  return (
    detections
      .map((d) => {
        const exposure = d.exposure
          ? ` exposure=${d.exposure.seconds}s (basis: ${d.exposure.basis})`
          : "";
        return `integrity[tier ${d.tier}]: absent content in ${d.pushHome} — "${d.contentId}" detected ${d.detectedAt}${exposure}`;
      })
      .join("\n") + "\n"
  );
}

/**
 * Tier-2 boot sweep. Verify the lane's previous-session push set is still
 * content-present at the fetched (rebased) origin tip. Return detections for
 * any absence. Reads git and lane files from `wikiDir` (the rebased tree).
 * Never writes. Never throws into the flow (the caller wraps it).
 *
 * @param {object} ctx
 * @param {import('@forwardimpact/libutil/runtime').Runtime} ctx.runtime
 * @param {import('@forwardimpact/libutil').GitClient} ctx.gitClient
 * @param {string} ctx.wikiDir - The wiki clone dir (git cwd and fs read-root).
 * @param {string} ctx.agent - Lane agent id.
 * @param {number} ctx.now - Wall-clock (ms).
 * @returns {Promise<object[]>} Detections (possibly empty).
 */
export async function sweepTier2({ runtime, gitClient, wikiDir, agent, now }) {
  const email = await gitClient.configGet("user.email", { cwd: wikiDir });
  if (!email) {
    // Lane identity unresolvable. Never a silent vacuous pass.
    return [
      makeDetection({
        tier: 2,
        contentId: "<unresolvable: no author identity>",
        pushHome: "-",
        now,
      }),
    ];
  }
  const commits = await gitClient.logByAuthor(email, {
    cwd: wikiDir,
    ref: "HEAD",
  });
  const window = previousSessionWindow(commits, SESSION_GAP_MS);
  if (window.kind === "vacuous") return [];

  const detections = [];
  const changes = [];
  // Oldest→newest so own-deletions cancel in commit order.
  const ordered = [...window.commits].reverse();
  for (const commit of ordered) {
    const diff = await gitClient.diffRange(`${commit.sha}~1 ${commit.sha}`, {
      cwd: wikiDir,
    });
    if (diff === null) {
      detections.push(
        makeDetection({
          tier: 2,
          contentId: `<unresolvable content: ${commit.sha}>`,
          pushHome: "-",
          now,
        }),
      );
      continue;
    }
    for (const rec of parseDiff(diff)) {
      if (isLaneFile(rec.home, agent))
        changes.push({ ...rec, when: commit.when });
    }
  }

  const tipText = enumerateLaneFiles(wikiDir, agent, runtime.fsSync)
    .map((rel) => readFileOrEmpty(runtime.fsSync, wikiDir, rel))
    .join("\n");

  for (const absent of findAbsent(changes, tipText, normLine)) {
    // Exposure runs from the LAST window commit that added this exact line
    // (its most recent assertion at origin). A same-home commit does not count.
    const when = lastAssertionTime(changes, absent.contentId);
    const exposureSeconds =
      when != null ? Math.round(now / 1000 - when) : undefined;
    detections.push(
      makeDetection({
        tier: 2,
        contentId: absent.contentId,
        pushHome: absent.pushHome,
        now,
        exposureSeconds,
      }),
    );
  }
  return detections;
}

/** The `when` of the latest window change whose normalized additions include `contentId`. */
function lastAssertionTime(changes, contentId) {
  let when;
  for (const change of changes) {
    if (change.added.some((line) => normLine(line) === contentId)) {
      when = change.when;
    }
  }
  return when;
}

function readFileOrEmpty(fsSync, wikiDir, rel) {
  const abs = `${wikiDir}/${rel}`;
  try {
    return fsSync.readFileSync(abs, "utf-8");
  } catch {
    return "";
  }
}
