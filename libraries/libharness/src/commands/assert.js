import { basename } from "node:path";
import jmespath from "jmespath";

/**
 * Evaluate an assertion and return the structured result.
 * @param {object} values - { grep?: string, query?: string, exists?: boolean, not?: boolean, message?: string }
 * @param {string[]} args - [testName, file]
 * @param {object} fsSync - Sync filesystem surface (`runtime.fsSync`): `existsSync`, `readFileSync`.
 * @returns {{ test: string, pass: boolean, message?: string }}
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: assertion dispatch by type
export function evaluateAssertion(values, args, fsSync) {
  const testName = args[0];
  if (!testName) throw new Error("assert: missing test name");

  const file = args[1];
  const modes = [
    values.grep,
    values.query,
    values.exists,
    values["cites-job"],
  ].filter((v) => v !== undefined && v !== false);
  if (modes.length === 0) {
    throw new Error(
      "assert: specify one of --grep, --query, --exists, or --cites-job",
    );
  }
  if (modes.length > 1) {
    throw new Error(
      "assert: specify only one of --grep, --query, --exists, or --cites-job",
    );
  }

  let result;
  if (values.exists) {
    if (!file) throw new Error("assert: missing file argument");
    result = assertExists(file, fsSync);
  } else if (values.grep) {
    if (!file) throw new Error("assert: missing file argument for --grep");
    result = assertGrep(values.grep, file, fsSync);
  } else if (values["cites-job"]) {
    if (!file) throw new Error("assert: missing file argument for --cites-job");
    result = assertCitesJob(values["cites-job"], file, fsSync);
  } else {
    if (!file) throw new Error("assert: missing file argument for --query");
    result = assertQuery(values.query, file, fsSync);
  }

  if (values.not) {
    result.pass = !result.pass;
    if (result.pass) {
      delete result.message;
    } else {
      result.message =
        result.message ?? `inverted assertion failed for ${basename(file)}`;
    }
  }

  if (!result.pass && values.message) {
    result.message = values.message;
  }

  const output = { test: testName, pass: result.pass };
  if (result.message) output.message = result.message;
  return output;
}

/**
 * Run an assertion, write JSON to stdout, and return a failure envelope when
 * the assertion does not pass.
 * @param {import("@forwardimpact/libcli").InvocationContext} ctx
 * @returns {Promise<{ok: true} | {ok: false, code: number, error: string}>}
 */
export async function runAssertCommand(ctx) {
  const runtime = ctx.deps.runtime;
  const args = [ctx.args["test-name"], ctx.args.file];
  let result;
  try {
    result = evaluateAssertion(ctx.options, args, runtime.fsSync);
  } catch (err) {
    return { ok: false, code: 1, error: err.message };
  }
  runtime.proc.stdout.write(JSON.stringify(result) + "\n");
  return result.pass ? { ok: true } : { ok: false, code: 1, error: "" };
}

function assertExists(file, fsSync) {
  if (fsSync.existsSync(file)) return { pass: true };
  return { pass: false, message: `${file} not found` };
}

function assertGrep(pattern, file, fsSync) {
  const content = fsSync.readFileSync(file, "utf8");
  const re = new RegExp(pattern, "im");
  if (re.test(content)) return { pass: true };
  return {
    pass: false,
    message: `pattern "${pattern}" not found in ${basename(file)}`,
  };
}

function assertQuery(expression, file, fsSync) {
  const content = fsSync.readFileSync(file, "utf8");
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

function assertCitesJob(jobFile, file, fsSync) {
  const jobContent = fsSync.readFileSync(jobFile, "utf8");
  const match = JOB_TAG_RE.exec(jobContent);
  if (!match) {
    return {
      pass: false,
      message: `no <job> tag found in ${basename(jobFile)}`,
    };
  }
  const citation = `${match[1]}: ${match[2]}`;
  const content = fsSync.readFileSync(file, "utf8");
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
