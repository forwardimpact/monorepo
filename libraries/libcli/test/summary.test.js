import { test, describe } from "node:test";
import assert from "node:assert";

import { SummaryRenderer } from "../src/summary.js";

function createStream() {
  return {
    output: "",
    write(data) {
      this.output += data;
    },
  };
}

function makeProc(env = {}) {
  return { stdout: { write() {} }, env };
}

describe("SummaryRenderer", () => {
  test("writes the title and the aligned items", () => {
    const stream = createStream();
    const renderer = new SummaryRenderer({ process: makeProc() });
    renderer.render(
      {
        title: "Generated 38 files",
        ok: true,
        items: [
          { label: "definitions/", description: "Service definitions" },
          { label: "proto/", description: "Proto source files" },
        ],
      },
      stream,
    );
    assert.ok(stream.output.includes("Generated 38 files\n"));
    assert.ok(stream.output.includes("definitions/"));
    assert.ok(stream.output.includes("proto/"));
    const lines = stream.output.split("\n").filter((l) => l.startsWith("  "));
    const firstDash = lines[0].indexOf("—");
    const secondDash = lines[1].indexOf("—");
    assert.strictEqual(firstDash, secondDash);
  });

  test("writes only the title when items is empty", () => {
    const stream = createStream();
    const renderer = new SummaryRenderer({ process: makeProc() });
    renderer.render({ title: "Done", ok: true, items: [] }, stream);
    assert.strictEqual(stream.output, "\nDone\n");
  });

  test("right-pads labels to the longest label width", () => {
    const stream = createStream();
    const renderer = new SummaryRenderer({ process: makeProc() });
    renderer.render(
      {
        title: "Title",
        ok: true,
        items: [
          { label: "ab", description: "short" },
          { label: "abcdef", description: "long" },
        ],
      },
      stream,
    );
    const lines = stream.output.split("\n").filter((l) => l.startsWith("  "));
    assert.ok(lines[0].includes("ab    "));
  });

  test("suppresses the successful summary when LOG_LEVEL=error", () => {
    const stream = createStream();
    const renderer = new SummaryRenderer({
      process: makeProc({ LOG_LEVEL: "error" }),
    });
    renderer.render(
      { title: "Done", ok: true, items: [{ label: "a", description: "b" }] },
      stream,
    );
    assert.strictEqual(stream.output, "");
  });

  test("prints the failed summary even when LOG_LEVEL=error", () => {
    const stream = createStream();
    const renderer = new SummaryRenderer({
      process: makeProc({ LOG_LEVEL: "error" }),
    });
    renderer.render(
      { title: "Failed", ok: false, items: [{ label: "a", description: "b" }] },
      stream,
    );
    assert.ok(stream.output.includes("Failed"));
    assert.ok(stream.output.includes("a"));
  });

  test("prints the successful summary at the default LOG_LEVEL", () => {
    const stream = createStream();
    const renderer = new SummaryRenderer({ process: makeProc() });
    renderer.render({ title: "Done", ok: true, items: [] }, stream);
    assert.strictEqual(stream.output, "\nDone\n");
  });

  test("throws when ok is missing", () => {
    const renderer = new SummaryRenderer({ process: makeProc() });
    assert.throws(
      () => renderer.render({ title: "x", items: [] }, createStream()),
      /requires an explicit `ok` boolean/,
    );
  });

  test("renders extras after items under the same suppression gate", () => {
    const stream = createStream();
    const renderer = new SummaryRenderer({ process: makeProc() });
    renderer.render(
      {
        title: "Block",
        ok: true,
        items: [{ label: "k", description: "v" }],
        extras: "table line 1\ntable line 2",
      },
      stream,
    );
    assert.ok(stream.output.includes("table line 1"));
    assert.ok(stream.output.includes("table line 2"));
    assert.ok(stream.output.endsWith("\n"));
  });

  test("suppresses extras alongside items when LOG_LEVEL=error and ok", () => {
    const stream = createStream();
    const renderer = new SummaryRenderer({
      process: makeProc({ LOG_LEVEL: "error" }),
    });
    renderer.render(
      { title: "Block", ok: true, items: [], extras: "should not appear" },
      stream,
    );
    assert.strictEqual(stream.output, "");
  });

  test("shouldRender mirrors the render gate", () => {
    const renderer = new SummaryRenderer({
      process: makeProc({ LOG_LEVEL: "error" }),
    });
    assert.strictEqual(renderer.shouldRender(true), false);
    assert.strictEqual(renderer.shouldRender(false), true);
    const def = new SummaryRenderer({ process: makeProc() });
    assert.strictEqual(def.shouldRender(true), true);
  });

  test("prepends a blank-line margin before the title", () => {
    const stream = createStream();
    const renderer = new SummaryRenderer({ process: makeProc() });
    renderer.render({ title: "Block", ok: true, items: [] }, stream);
    assert.ok(stream.output.startsWith("\nBlock\n"));
  });

  test("does not emit the margin when the renderer suppresses the block", () => {
    const stream = createStream();
    const renderer = new SummaryRenderer({
      process: makeProc({ LOG_LEVEL: "error" }),
    });
    renderer.render({ title: "Block", ok: true, items: [] }, stream);
    assert.strictEqual(stream.output, "");
  });

  test("shouldRender requires an explicit boolean", () => {
    const renderer = new SummaryRenderer({ process: makeProc() });
    assert.throws(
      () => renderer.shouldRender(),
      /requires an explicit `ok` boolean/,
    );
  });
});
