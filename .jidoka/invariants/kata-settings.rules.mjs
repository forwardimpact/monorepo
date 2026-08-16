// Invariant: kata-settings — the machine-readable copy of the
// `.kata/settings.json` key vocabulary. It validates the settings file
// when one exists, and checks every `<setting>` options block
// in the skill and agent references against the vocabulary. The prose
// grammar lives in .claude/agents/x-kata-settings.md; the owning tables in
// .claude/skills/kata-release-merge/references/settings.md and
// .claude/skills/kata-review/references/settings.md. Consumer repositories
// are governed by the read mechanic's degradation rules; this invariant is
// this repository's stop-the-line gate.

export const VOCABULARY = {
  trustSource: {
    kind: "select",
    options: ["top-contributors", "allowlist"],
    default: "top-contributors",
  },
  trustContributorCount: { kind: "integer", min: 1, default: 7 },
  trustAllowlist: { kind: "string-list", default: [] },
  reviewPanel: {
    kind: "select",
    options: ["light", "standard", "thorough"],
    default: "standard",
  },
  reviewBlockingSeverity: {
    kind: "select",
    options: ["blocker", "high", "medium", "low"],
    default: "medium",
  },
};

// A vocabulary default serialized the way the `default` attribute writes it:
// strings verbatim, everything else as JSON (`[]`, `7`).
const defaultAttr = (key) => {
  const d = VOCABULARY[key].default;
  return typeof d === "string" ? d : JSON.stringify(d);
};

// Blank out fenced code blocks and keep the line numbers, so the grammar
// example in the shared reference never registers as a real block.
const stripFences = (text) => {
  let inFence = false;
  return text.split("\n").map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return "";
    }
    return inFence ? "" : line;
  });
};

const OPEN_TAG = /^<setting\s/;
const OPEN_TAG_ONE_LINE = /^<setting((?:\s+\w+="[^"]*")+)\s*>$/;
const CLOSE_TAG = /^<\/setting>$/;

// Parse a one-line opening tag into `{ key, default }`, or `{ tagError }`
// when the tag spans lines or carries the wrong attributes.
function parseOpenTag(line) {
  const m = line.match(OPEN_TAG_ONE_LINE);
  if (!m) return { tagError: "opening tag does not parse on one line" };
  const attrs = [...m[1].matchAll(/(\w+)="([^"]*)"/g)];
  const names = attrs.map((a) => a[1]);
  if (names.join(",") !== "key,default") {
    return {
      tagError: `attributes are [${names.join(", ")}], not exactly [key, default]`,
    };
  }
  return { key: attrs[0][2], default: attrs[1][2] };
}

// Collect a block's option-table rows (first-column identifier plus
// `(default)` mark) up to its closing tag. `closedAt` is -1 when the next
// opening tag or the end of the file arrives first.
function collectBody(lines, from) {
  const options = [];
  for (let j = from; j < lines.length; j++) {
    const body = lines[j].trim();
    if (OPEN_TAG.test(body)) return { options, closedAt: -1 };
    if (CLOSE_TAG.test(body)) return { options, closedAt: j };
    const row = body.match(/^\|\s*`([^`]+)`\s*(\(default\))?\s*\|/);
    if (row) options.push({ id: row[1], isDefault: !!row[2] });
  }
  return { options, closedAt: -1 };
}

// Extract every `<setting>` block from one stripped file. A malformed block
// carries `tagError` instead of a parsed key. Lines are fully trimmed before
// the tag match, so an indented block cannot slip past extraction.
function extractBlocks(lines) {
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!OPEN_TAG.test(line)) continue;
    const block = { lineNo: i + 1, ...parseOpenTag(line) };
    const { options, closedAt } = collectBody(lines, i + 1);
    block.options = options;
    if (closedAt === -1) {
      block.tagError ??= "no paired closing </setting> tag";
    } else {
      i = closedAt;
    }
    blocks.push(block);
  }
  return blocks;
}

// One flat object of identifiers, integers, and string lists. Returns the
// shape problems, empty when conformant.
function fileShapeProblems(parsed) {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return ["the file is not one flat JSON object"];
  }
  const problems = [];
  for (const [key, value] of Object.entries(parsed)) {
    const ok =
      typeof value === "string" ||
      typeof value === "number" ||
      (Array.isArray(value) && value.every((v) => typeof v === "string"));
    if (!ok)
      problems.push(
        `key "${key}" holds neither an identifier, an integer, nor a string list`,
      );
  }
  return problems;
}

// Per-key value validation against the vocabulary entry's kind.
function valueProblem(key, value) {
  const spec = VOCABULARY[key];
  if (spec.kind === "select") {
    if (typeof value !== "string" || !spec.options.includes(value))
      return `"${value}" is not one of: ${spec.options.join(", ")}`;
  }
  if (spec.kind === "integer") {
    if (!Number.isInteger(value)) return `"${value}" is not an integer`;
    if (value < spec.min) return `${value} is under the minimum ${spec.min}`;
  }
  if (spec.kind === "string-list") {
    if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
      return `"${value}" is not a string list`;
  }
  return null;
}

export default {
  name: "kata-settings",

  build({ root, scan, readText }) {
    const fileSubjects = [];
    const raw = readText(".kata/settings.json");
    if (raw != null) {
      const path = `${root}/.kata/settings.json`;
      let parsed = null;
      let parseError = null;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        parseError = err.message;
      }
      fileSubjects.push({ kind: "file", path, raw, parsed, parseError });
      const flat =
        !parseError &&
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed);
      if (flat) {
        const lines = raw.split("\n");
        for (const [key, value] of Object.entries(parsed)) {
          const keyLine = new RegExp(`^\\s*"${key}"\\s*:`);
          const lineNo = lines.findIndex((l) => keyLine.test(l)) + 1;
          fileSubjects.push({ kind: "key", path, key, value, lineNo });
        }
      }
    }

    const blocks = scan({
      dirs: [".claude/skills", ".claude/agents"],
      match: (n) => n.endsWith(".md"),
      read: true,
    }).flatMap(({ path, text }) =>
      extractBlocks(stripFences(text)).map((b) => ({
        kind: "block",
        path,
        ...b,
      })),
    );

    // The inventory subject carries the cross-subject view for the
    // key-drift rule. A ctx-side map alone cannot report a missing block
    // when zero blocks exist, because rules fire per subject; the
    // inventory subject is always present, so the rule always can.
    return {
      subjects: {
        "settings-file": fileSubjects,
        "setting-block": [...blocks, { kind: "inventory", blocks }],
      },
    };
  },

  rules: [
    {
      id: "kata-settings.file-invalid",
      scope: "settings-file",
      severity: "fail",
      when: (s) => s.kind === "file",
      check: (s) => {
        if (s.parseError) return { detail: `not valid JSON: ${s.parseError}` };
        const problems = fileShapeProblems(s.parsed);
        return problems.length ? problems.map((detail) => ({ detail })) : null;
      },
      message: (_s, item) => item.detail,
      hint: "make .kata/settings.json one flat JSON object of identifiers, integers, and string lists",
    },
    {
      id: "kata-settings.unknown-key",
      scope: "settings-file",
      severity: "fail",
      when: (s) => s.kind === "key" && !(s.key in VOCABULARY),
      check: (s) => ({ detail: `unknown key "${s.key}"` }),
      message: (_s, item) => item.detail,
      hint: "use only the keys the owning <setting> tables define",
    },
    {
      id: "kata-settings.invalid-value",
      scope: "settings-file",
      severity: "fail",
      when: (s) => s.kind === "key" && s.key in VOCABULARY,
      check: (s) => {
        const problem = valueProblem(s.key, s.value);
        return problem ? { detail: `${s.key}: ${problem}` } : null;
      },
      message: (_s, item) => item.detail,
      hint: "select a value from the key's owning <setting> table",
    },
    {
      id: "kata-settings.block-grammar",
      scope: "setting-block",
      severity: "fail",
      when: (s) => s.kind === "block" && s.tagError,
      check: (s) => ({ detail: s.tagError }),
      message: (_s, item) => item.detail,
      hint: "a <setting> opening tag carries exactly key and default on one line and pairs with </setting> (x-kata-settings.md)",
    },
    {
      id: "kata-settings.block-key-drift",
      scope: "setting-block",
      severity: "fail",
      when: (s) => s.kind === "inventory",
      check: (s) => {
        const keys = s.blocks.filter((b) => !b.tagError).map((b) => b.key);
        const items = [];
        for (const key of Object.keys(VOCABULARY)) {
          const n = keys.filter((k) => k === key).length;
          if (n === 0) items.push({ detail: `no <setting> block for ${key}` });
          if (n > 1) items.push({ detail: `${n} <setting> blocks for ${key}` });
        }
        for (const key of new Set(keys)) {
          if (!(key in VOCABULARY))
            items.push({
              detail: `<setting> block for unknown key ${key}`,
            });
        }
        return items.length ? items : null;
      },
      message: (_s, item) => item.detail,
      hint: "keep exactly one <setting> block per vocabulary key (kata-settings.rules.mjs VOCABULARY)",
    },
    {
      id: "kata-settings.default-drift",
      scope: "setting-block",
      severity: "fail",
      when: (s) => s.kind === "block" && !s.tagError && s.key in VOCABULARY,
      check: (s) =>
        s.default === defaultAttr(s.key)
          ? null
          : {
              detail: `${s.key} default attribute is "${s.default}", vocabulary says "${defaultAttr(s.key)}"`,
            },
      message: (_s, item) => item.detail,
      hint: "align the block's default attribute with the vocabulary default",
    },
    {
      id: "kata-settings.table-drift",
      scope: "setting-block",
      severity: "fail",
      when: (s) =>
        s.kind === "block" &&
        !s.tagError &&
        VOCABULARY[s.key]?.kind === "select",
      check: (s) => {
        const items = [];
        const ids = s.options.map((o) => o.id);
        const expected = VOCABULARY[s.key].options;
        if (JSON.stringify(ids) !== JSON.stringify(expected))
          items.push({
            detail: `${s.key} option column is [${ids.join(", ")}], vocabulary says [${expected.join(", ")}]`,
          });
        const marked = s.options.filter((o) => o.isDefault);
        if (marked.length !== 1)
          items.push({
            detail: `${s.key} table carries ${marked.length} (default) marks, not exactly one`,
          });
        else if (marked[0].id !== s.default)
          items.push({
            detail: `${s.key} marks "${marked[0].id}" as default, the attribute says "${s.default}"`,
          });
        return items.length ? items : null;
      },
      message: (_s, item) => item.detail,
      hint: "make the selector table's option column and (default) mark match the vocabulary and the default attribute",
    },
  ],
};
