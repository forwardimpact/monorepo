import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { writeMemo } from "../src/memo-writer.js";
import { MEMO_INBOX_MARKER } from "../src/constants.js";

function createFakeFs(content) {
  let written = null;
  return {
    readFileSync: () => content,
    writeFileSync: (_path, data) => {
      written = data;
    },
    get written() {
      return written;
    },
  };
}

describe("writeMemo", () => {
  const base = {
    summaryPath: "wiki/staff-engineer.md",
    sender: "technical-writer",
    message: "audit d642ff0c",
    today: "2026-05-02",
  };

  test("appends bullet after marker", () => {
    const content = [
      "## Message Inbox",
      MEMO_INBOX_MARKER,
      "",
      "Some other content",
    ].join("\n");

    const fs = createFakeFs(content);
    const result = writeMemo(base, fs);

    assert.deepStrictEqual(result, {
      written: true,
      path: "wiki/staff-engineer.md",
    });

    const lines = fs.written.split("\n");
    assert.equal(lines[1], MEMO_INBOX_MARKER);
    assert.equal(
      lines[2],
      "- 2026-05-02 from **technical-writer**: audit d642ff0c",
    );
  });

  test("returns missing-marker when marker absent", () => {
    const content = "## Message Inbox\n\nNo marker here.\n";
    const fs = createFakeFs(content);
    const result = writeMemo(base, fs);

    assert.deepStrictEqual(result, {
      written: false,
      reason: "missing-marker",
      path: "wiki/staff-engineer.md",
    });
    assert.equal(fs.written, null);
  });

  test("preserves the marker after the write", () => {
    const content = ["## Message Inbox", MEMO_INBOX_MARKER, ""].join("\n");

    const fs = createFakeFs(content);
    writeMemo(base, fs);

    assert.ok(fs.written.includes(MEMO_INBOX_MARKER));
  });

  test("collapses a multi-line message to a single line", () => {
    const content = ["## Message Inbox", MEMO_INBOX_MARKER, ""].join("\n");

    const fs = createFakeFs(content);
    writeMemo({ ...base, message: "line one\nline two\nline three" }, fs);

    const lines = fs.written.split("\n");
    assert.equal(
      lines[2],
      "- 2026-05-02 from **technical-writer**: line one line two line three",
    );
  });
});
