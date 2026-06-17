import {
  AGENT_EXPERIMENTS_CLOSE_RE,
  AGENT_EXPERIMENTS_OPEN_RE,
  ISSUE_CLOSE_RE,
  ISSUE_OPEN_RE,
  XMR_CLOSE_RE,
  XMR_OPEN_RE,
} from "./constants.js";

function openLabel(open) {
  if (open.kind === "xmr") return open.metric;
  if (open.kind === "agent-experiments") return "agent-experiments";
  return open.topic;
}

function warnDangling(open, warn) {
  warn(`dangling-marker ${openLabel(open)} at line ${open.openLine + 1}\n`);
}

function tryOpen(line, i) {
  const xmrMatch = line.match(XMR_OPEN_RE);
  if (xmrMatch) {
    return {
      kind: "xmr",
      metric: xmrMatch[1],
      csvPath: xmrMatch[2],
      priorReadAnchor: xmrMatch[3] || null,
      openLine: i,
    };
  }
  const issueMatch = line.match(ISSUE_OPEN_RE);
  if (issueMatch) {
    return {
      kind: "issue-list",
      topic: issueMatch[1],
      state: issueMatch[2],
      window: issueMatch[3] || null,
      openLine: i,
    };
  }
  if (AGENT_EXPERIMENTS_OPEN_RE.test(line)) {
    return { kind: "agent-experiments", openLine: i };
  }
  return null;
}

function closePair(open, i) {
  if (open.kind === "xmr") {
    return {
      kind: "xmr",
      metric: open.metric,
      csvPath: open.csvPath,
      priorReadAnchor: open.priorReadAnchor,
      openLine: open.openLine,
      closeLine: i,
    };
  }
  if (open.kind === "agent-experiments") {
    return {
      kind: "agent-experiments",
      openLine: open.openLine,
      closeLine: i,
    };
  }
  return {
    kind: "issue-list",
    topic: open.topic,
    state: open.state,
    window: open.window,
    openLine: open.openLine,
    closeLine: i,
  };
}

function matchClose(line, open) {
  if (!open) return false;
  if (open.kind === "xmr") return XMR_CLOSE_RE.test(line);
  if (open.kind === "agent-experiments") {
    return AGENT_EXPERIMENTS_CLOSE_RE.test(line);
  }
  const m = line.match(ISSUE_CLOSE_RE);
  return Boolean(m && open.kind === "issue-list" && open.topic === m[1]);
}

/**
 * Scan text for paired marker blocks (xmr or issue-list). Returns positions and
 * metadata. Dangling open markers are reported through the injected `warn`
 * callback (default: discard) instead of writing to the process directly.
 * @param {string} text - The storyboard text to scan.
 * @param {{warn?: (message: string) => void}} [options]
 * @returns {Array<object>} The paired marker blocks.
 */
export function scanMarkers(text, { warn = () => {} } = {}) {
  const lines = text.split("\n");
  const pairs = [];
  let open = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const newOpen = tryOpen(line, i);
    if (newOpen) {
      if (open) warnDangling(open, warn);
      open = newOpen;
      continue;
    }
    if (matchClose(line, open)) {
      pairs.push(closePair(open, i));
      open = null;
    }
  }

  if (open) warnDangling(open, warn);

  return pairs;
}
