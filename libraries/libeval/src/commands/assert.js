import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import jmespath from "jmespath";

const ASSERT_MODES = [
  {
    key: "exists",
    missingFileMsg: "assert: missing file argument",
    run: (values, file) => assertExists(file),
  },
  {
    key: "grep",
    missingFileMsg: "assert: missing file argument for --grep",
    run: (values, file) => assertGrep(values.grep, file),
  },
  {
    key: "cites-job",
    missingFileMsg: "assert: missing file argument for --cites-job",
    run: (values, file) => assertCitesJob(values["cites-job"], file),
  },
  {
    key: "query",
    missingFileMsg: "assert: missing file argument for --query",
    run: (values, file) => assertQuery(values.query, file),
  },
];

function selectMode(values) {
  const active = ASSERT_MODES.filter(
    (m) => values[m.key] !== undefined && values[m.key] !== false,
  );
  if (active.length === 0) {
    throw new Error(
      "assert: specify one of --grep, --query, --exists, or --cites-job",
    );
  }
  if (active.length > 1) {
    throw new Error(
      "assert: specify only one of --grep, --query, --exists, or --cites-job",
    );
  }
  return active[0];
}

function applyNot(result, file) {
  const pass = !result.pass;
  if (pass) return { pass: true };
  return {
    pass: false,
    message:
      result.message ?? `inverted assertion failed for ${basename(file)}`,
  };
}

/**
 * Evaluate an assertion and return the structured result.
 * @param {object} values - { grep?: string, query?: string, exists?: boolean, not?: boolean, message?: string }
 * @param {string[]} args - [testName, file]
 * @returns {{ test: string, pass: boolean, message?: string }}
 */
export function evaluateAssertion(values, args) {
  const testName = args[0];
  if (!testName) throw new Error("assert: missing test name");

  const file = args[1];
  const mode = selectMode(values);
  if (!file) throw new Error(mode.missingFileMsg);

  let result = mode.run(values, file);
  if (values.not) result = applyNot(result, file);
  if (!result.pass && values.message) result.message = values.message;

  const output = { test: testName, pass: result.pass };
  if (result.message) output.message = result.message;
  return output;
}

/**
 * Run an assertion, write JSON to stdout, and set process.exitCode on failure.
 * @param {object} values
 * @param {string[]} args
 */
export async function runAssertCommand(values, args) {
  const result = evaluateAssertion(values, args);
  process.stdout.write(JSON.stringify(result) + "\n");
  if (!result.pass) process.exitCode = 1;
}

function assertExists(file) {
  if (existsSync(file)) return { pass: true };
  return { pass: false, message: `${file} not found` };
}

function assertGrep(pattern, file) {
  const content = readFileSync(file, "utf8");
  const re = new RegExp(pattern, "im");
  if (re.test(content)) return { pass: true };
  return {
    pass: false,
    message: `pattern "${pattern}" not found in ${basename(file)}`,
  };
}

function assertQuery(expression, file) {
  const content = readFileSync(file, "utf8");
  const data = parseJsonOrNdjson(content);
  const result = jmespath.search(data, expression);
  const truthy =
    result !== null &&
    result !== undefined &&
    result !== false &&
    (Array.isArray(result) ? result.length > 0 : true);
  if (truthy) return { pass: true };
  return {
    pass: false,
    message: `query returned ${JSON.stringify(result)}`,
  };
}

const JOB_TAG_RE = /<job\s+user="([^"]*)"\s+goal="([^"]*)">/;

function assertCitesJob(jobFile, file) {
  const jobContent = readFileSync(jobFile, "utf8");
  const match = JOB_TAG_RE.exec(jobContent);
  if (!match) {
    return {
      pass: false,
      message: `no <job> tag found in ${basename(jobFile)}`,
    };
  }
  const citation = `${match[1]}: ${match[2]}`;
  const content = readFileSync(file, "utf8");
  if (content.includes(citation)) return { pass: true };
  return { pass: false, message: `missing "${citation}"` };
}

function parseJsonOrNdjson(content) {
  try {
    return JSON.parse(content);
  } catch {
    // Fall through to NDJSON
  }
  const lines = [];
  for (const raw of content.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      lines.push(JSON.parse(trimmed));
    } catch {
      // skip unparseable lines
    }
  }
  if (lines.length === 0) throw new Error("assert: no valid JSON in file");
  return lines;
}
