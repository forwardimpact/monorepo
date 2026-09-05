// `assess` measures. It mints no privileged token, writes no variable, and
// exits 0 on every outcome, so a quiet run costs nothing and a breach reaches
// the engage job through the step outputs.

import { evaluate } from "../evaluate.js";
import { activityRules } from "../rule.js";
import { encodeReason } from "../reason.js";
import { renderSummary } from "../summary.js";
import { createRequest } from "../request.js";
import { appendEnvFile, resolveRepo } from "../ci.js";

/**
 * Read an option as a positive number.
 * @param {*} value - The raw option value.
 * @returns {?number} The number, or `null` when it is absent or not positive.
 */
function positiveNumber(value) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Run the assess command: count every rule over the window and report.
 * @param {object} ctx - The libcli invocation context.
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

  const repo = resolveRepo(options, proc);
  if (!repo) {
    return { ok: false, error: "assess requires --repo as owner/repo" };
  }
  const token = proc.env.GH_TOKEN;
  if (!token) {
    return { ok: false, error: "assess requires GH_TOKEN in the environment" };
  }

  const windowMs = windowHours * 3600000;
  const request = createRequest({ token, clock: runtime.clock });
  const verdict = await evaluate(activityRules(threshold), {
    request,
    repo,
    defaultBranch: options["default-branch"] || "main",
    clock: runtime.clock,
    windowMs,
  });

  const reason = verdict.engage
    ? encodeReason({
        name: "watchdog",
        breaches: verdict.breaches,
        at: verdict.cutoff,
      })
    : "";

  await appendEnvFile(
    runtime,
    "GITHUB_STEP_SUMMARY",
    renderSummary({
      verdict,
      killswitchValue: options["killswitch-value"],
    }),
  );
  // The reason is one line, so the outputs file needs no heredoc delimiter.
  await appendEnvFile(
    runtime,
    "GITHUB_OUTPUT",
    `verdict=${verdict.engage ? "engage" : "quiet"}\nreason=${reason}\n`,
  );

  if (options.format === "json") {
    proc.stdout.write(`${JSON.stringify({ ...verdict, reason }, null, 2)}\n`);
  } else {
    proc.stdout.write(
      renderSummary({
        verdict,
        killswitchValue: options["killswitch-value"],
      }),
    );
  }

  return { ok: true };
}
