// Markers tolerate optional trailing text after the tag (typically an inline
// "Do not edit. Generated from fit-wiki refresh." notice), so an open or close
// marker can carry its own warning without needing a separate notice line.
const XMR_OPEN_RE = /^<!--\s*xmr:([^:\s]+):(\S+)(?:\s+[^>]*?)?\s*-->\s*$/;
const ISSUE_OPEN_RE =
  /^<!--\s*(obstacles|experiments):(open|closed)(?::(\d+d))?(?:\s+[^>]*?)?\s*-->\s*$/;
const XMR_CLOSE_RE = /^<!--\s*\/xmr(?:\s+[^>]*?)?\s*-->\s*$/;
const ISSUE_CLOSE_RE =
  /^<!--\s*\/(obstacles|experiments)(?:\s+[^>]*?)?\s*-->\s*$/;

function openLabel(open) {
  return open.kind === "xmr" ? open.metric : open.topic;
}

function warnDangling(open) {
  process.stderr.write(
    `dangling-marker ${openLabel(open)} at line ${open.openLine + 1}\n`,
  );
}

function tryOpen(line, i) {
  const xmrMatch = line.match(XMR_OPEN_RE);
  if (xmrMatch) {
    return {
      kind: "xmr",
      metric: xmrMatch[1],
      csvPath: xmrMatch[2],
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
  return null;
}

function closePair(open, i) {
  if (open.kind === "xmr") {
    return {
      kind: "xmr",
      metric: open.metric,
      csvPath: open.csvPath,
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
  const m = line.match(ISSUE_CLOSE_RE);
  return Boolean(m && open.kind === "issue-list" && open.topic === m[1]);
}

/** Scan text for paired marker blocks (xmr or issue-list). Returns positions and metadata. */
export function scanMarkers(text) {
  const lines = text.split("\n");
  const pairs = [];
  let open = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const newOpen = tryOpen(line, i);
    if (newOpen) {
      if (open) warnDangling(open);
      open = newOpen;
      continue;
    }
    if (matchClose(line, open)) {
      pairs.push(closePair(open, i));
      open = null;
    }
  }

  if (open) warnDangling(open);

  return pairs;
}
