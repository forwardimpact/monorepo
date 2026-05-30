// Pure detection rules for the libmock inline-fake guard, extracted so a
// regression test can exercise them without running the file-walking script.

const LIBMOCK_IMPORT_RE = /from\s+["']@forwardimpact\/libmock["']/;

/**
 * Return the inline-fake findings for a single test file's source text.
 * @param {string} text - The test file contents.
 * @returns {string[]} Human-readable finding messages (empty when clean).
 */
export function libmockFindings(text) {
  const imports = LIBMOCK_IMPORT_RE.test(text);
  const findings = [];

  if (
    /function\s+(concludeMsg|redirectMsg|tellMsg|shareMsg)\s*\(/.test(text) &&
    !text.includes("createToolUseMsg")
  ) {
    findings.push(
      "inline concludeMsg/redirectMsg/tellMsg/shareMsg — use createToolUseMsg",
    );
  }
  if (
    /function\s+stripAnsi\s*\(/.test(text) &&
    !text.includes("stripAnsi }") &&
    !imports
  ) {
    findings.push("inline stripAnsi — use libmock stripAnsi");
  }
  if (
    /const\s+mockLogger\s*=\s*\{\s*(info|debug|warn|error)/.test(text) &&
    !text.includes("createMockLogger") &&
    !text.includes("createSilentLogger")
  ) {
    findings.push("inline mockLogger object — use createSilentLogger");
  }
  if (/class\s+MockStorage\b/.test(text) && !imports) {
    findings.push("inline class MockStorage — use createMockStorage");
  }
  if (/\bmock\.fn\s*\(/.test(text)) {
    findings.push(
      "mock.fn from node:test is not bun-compatible — use spy from libmock",
    );
  }
  if (/\btest\s*\([^,)]*,\s*\([^)]*,\s*done\s*\)/.test(text)) {
    findings.push(
      "test(..., (_, done) => …) is not bun-compatible — rewrite as async",
    );
  }

  // Runtime collaborator surfaces: flag inline reimplementations of a
  // canonical runtime fake when the file doesn't import from libmock.
  const SURFACES = [
    ["createMockSubprocess", "createMockSubprocess"],
    ["createMockFinder", "createMockFinder"],
    ["createMockGitClient", "createMockGitClient"],
    ["createMockGhClient", "createMockGhClient"],
  ];
  for (const [factory, canonical] of SURFACES) {
    const inlineDef = new RegExp(`function\\s+${factory}\\s*\\(`);
    if (inlineDef.test(text) && !imports) {
      findings.push(`inline ${factory} — use libmock ${canonical}`);
    }
  }
  // Inline subprocess object literal: { run, spawn, calls } reinvents the fake.
  if (
    /\b(run|exec)\s*[:(][\s\S]{0,200}?\bspawn\s*[:(][\s\S]{0,200}?\bcalls\b/.test(
      text,
    ) &&
    !text.includes("createMockSubprocess") &&
    !imports
  ) {
    findings.push(
      "inline { run, spawn, calls } subprocess fake — use createMockSubprocess",
    );
  }

  return findings;
}
