import {
  AGENT_EXPERIMENTS_CLOSE_RE,
  AGENT_EXPERIMENTS_OPEN_RE,
  ISSUE_CLOSE_RE,
  ISSUE_OPEN_RE,
  XMR_CLOSE_RE,
  XMR_OPEN_RE,
  XMR_TOKEN_REASONS,
  XMR_TOKENS,
} from "./constants.js";

// `run` is group 3 of XMR_OPEN_RE: every word holds a non-empty key, then
// `=`, then a possibly empty value (which may itself hold `=`). A known key
// is `seen` once judged, usable or not, so its second occurrence is
// `repeated`; an unknown key is reported each time it appears.
function parseXmrTokens(run) {
  const out = { eventType: null, priorReadAnchor: null, tokenErrors: [] };
  const seen = new Set();
  for (const token of run.split(/\s+/).filter(Boolean)) {
    const at = token.indexOf("="); // never -1 or 0 under the regex
    const key = token.slice(0, at);
    const value = token.slice(at + 1);
    // hasOwn, so a prototype name such as `constructor=x` is an unknown key.
    if (!Object.hasOwn(XMR_TOKENS, key)) {
      out.tokenErrors.push({ key, value, reason: XMR_TOKEN_REASONS.unknown });
      continue;
    }
    const { field, valid } = XMR_TOKENS[key];
    if (seen.has(key)) {
      out.tokenErrors.push({ key, value, reason: XMR_TOKEN_REASONS.repeated });
    } else if (!valid(value)) {
      out.tokenErrors.push({ key, value, reason: XMR_TOKEN_REASONS.unusable });
    } else {
      out[field] = value;
    }
    seen.add(key);
  }
  return out;
}

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
      ...parseXmrTokens(xmrMatch[3]),
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
      eventType: open.eventType,
      priorReadAnchor: open.priorReadAnchor,
      tokenErrors: open.tokenErrors,
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
 * metadata. An xmr block carries `eventType` and `priorReadAnchor` (each a
 * value or null) from its marker tokens, and `tokenErrors`
 * (`[{ key, value, reason }]`) for every token the renderer cannot honour.
 * The scanner reports dangling open markers through the injected `warn`
 * callback (default: discard). It does not write to the process directly.
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
