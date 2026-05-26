/**
 * sanitiseAttachmentName unit tests.
 *
 * Pure-function tests — no filesystem touched. Covers worked-example traversal
 * payloads, the totality invariant for non-string inputs, and the round-trip
 * identity requirement for benign UTF-8 names.
 */
import { test, describe } from "node:test";
import assert from "node:assert";
import { sanitiseAttachmentName } from "../templates/.claude/skills/sync-apple-mail/scripts/sync-helpers.mjs";

describe("sanitiseAttachmentName — traversal and degenerate inputs", () => {
  test("strips POSIX traversal prefix", () => {
    assert.strictEqual(sanitiseAttachmentName("../../../foo"), "foo");
  });

  test("strips POSIX absolute prefix", () => {
    assert.strictEqual(sanitiseAttachmentName("/etc/passwd"), "passwd");
  });

  test("strips win32 traversal prefix", () => {
    assert.strictEqual(sanitiseAttachmentName("..\\..\\..\\foo"), "foo");
  });

  test("strips ASCII control bytes", () => {
    assert.strictEqual(sanitiseAttachmentName("\u0000bar"), "bar");
  });

  test("single dot collapses to fallback", () => {
    assert.strictEqual(sanitiseAttachmentName("."), "unnamed");
  });

  test("double dot collapses to fallback", () => {
    assert.strictEqual(sanitiseAttachmentName(".."), "unnamed");
  });

  test("empty string collapses to fallback", () => {
    assert.strictEqual(sanitiseAttachmentName(""), "unnamed");
  });

  test("null yields fallback", () => {
    assert.strictEqual(sanitiseAttachmentName(null), "unnamed");
  });

  test("undefined yields fallback (totality)", () => {
    assert.strictEqual(sanitiseAttachmentName(undefined), "unnamed");
  });

  test("number yields fallback (totality)", () => {
    assert.strictEqual(sanitiseAttachmentName(42), "unnamed");
  });
});

describe("sanitiseAttachmentName — benign UTF-8 round-trip", () => {
  test("simple ASCII filename byte-identical", () => {
    assert.strictEqual(sanitiseAttachmentName("contract.pdf"), "contract.pdf");
  });

  test("ASCII filename with whitespace byte-identical", () => {
    assert.strictEqual(sanitiseAttachmentName("Q3 plan.xlsx"), "Q3 plan.xlsx");
  });

  test("ASCII filename with parens byte-identical", () => {
    assert.strictEqual(
      sanitiseAttachmentName("image (2).png"),
      "image (2).png",
    );
  });

  test("non-ASCII UTF-8 filename byte-identical", () => {
    assert.strictEqual(
      sanitiseAttachmentName("café résumé.pdf"),
      "café résumé.pdf",
    );
  });
});
