// `assess` measures. It mints no privileged token, writes no variable, and
// exits 0 on every outcome, so a quiet run costs nothing and a breach reaches
// the engage job through the step outputs.

import { isoTimestamp } from "@forwardimpact/libutil";

import { evaluate } from "../evaluate.js";
import { activityRules } from "../rule.js";
import { encodeReason } from "../reason.js";
import { renderSummary } from "../summary.js";
import { createRequest } from "../request.js";
import {
  HOUR_MS,
  WRITER,
  appendEnvFile,
  positiveNumber,
  resolveRepo,
} from "../ci.js";

/**
 * Run the assess command: count every rule over the window and report.
 * @param {object} ctx - The libcli invocation context. `ctx.deps.request`
 *   replaces the transport and `ctx.deps.fetchImpl` replaces only its fetch,
 *   so a test reaches every branch with no network.
 * @returns {Promise<{ok: boolean, code?: number, error?: string}>} The envelope.
 */
export async function runAssessCommand(ctx) {
  const { options, deps } = ctx;
  const { runtime } = deps;
  const { proc } = runtime;

  const threshold = positiveNumber(options.threshold);
  if (threshold === null) {
    return {
      ok: false,
      error: "assess requires --threshold as a positive number",
    };
  }
  const windowHours = positiveNumber(options["window-hours"]);
  if (windowHours === null) {
    return {
      ok: false,
      error: "assess requires --window-hours as a positive number",
    };
  }
  const defaultBranch = String(options["default-branch"] ?? "").trim();
  if (!defaultBranch) {
    return { ok: false, error: "assess requires --default-branch" };
  }

  const repo = resolveRepo(options, proc);
  if (!repo) {
    return { ok: false, error: "assess requires --repo as owner/repo" };
  }
  const token = proc.env.GH_TOKEN;
  if (!token && !deps.request) {
    return { ok: false, error: "assess requires GH_TOKEN in the environment" };
  }

  const request =
    deps.request ??
    createRequest({
      token,
      clock: runtime.clock,
      fetchImpl: deps.fetchImpl,
    });
  const verdict = await evaluate(activityRules(threshold), {
    request,
    repo,
    defaultBranch,
    clock: runtime.clock,
    windowMs: windowHours * HOUR_MS,
  });

  // The reason records the moment of the run, not the moment the window
  // opened. An operator reads the value to learn when the team stopped.
  const reason = verdict.engage
    ? encodeReason({
        name: WRITER,
        breaches: verdict.breaches,
        at: isoTimestamp(runtime.clock.now()),
      })
    : "";

  const block = renderSummary({
    verdict,
    killswitchValue: options["killswitch-value"],
  });
  await appendEnvFile(runtime, "GITHUB_STEP_SUMMARY", block);
  // The reason is one line, so the outputs file needs no heredoc delimiter.
  await appendEnvFile(
    runtime,
    "GITHUB_OUTPUT",
    `verdict=${verdict.engage ? "engage" : "quiet"}\nreason=${reason}\n`,
  );

  if (options.format === "json") {
    proc.stdout.write(`${JSON.stringify({ ...verdict, reason }, null, 2)}\n`);
  } else {
    proc.stdout.write(block);
  }

  return { ok: true };
}
