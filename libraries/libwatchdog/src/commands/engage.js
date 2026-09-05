// `engage` writes. It runs only after a breach, it never produces a falsy
// value, and it yields both to a stop already in place and to a human who
// cleared the latch inside the window.

import { createActionsVariableLatch } from "../latches/actions-variable.js";
import { decide } from "../latch.js";
import { isTruthy } from "../truthy.js";
import { renderSummary } from "../summary.js";
import { createRequest } from "../request.js";
import { HOUR_MS, appendEnvFile, positiveNumber, resolveRepo } from "../ci.js";

/**
 * Report the run and return the envelope.
 * @param {object} runtime - The runtime bag.
 * @param {object} input - The `renderSummary` input.
 * @returns {Promise<void>} Resolves once the summary lands.
 */
async function report(runtime, input) {
  const block = renderSummary(input);
  await appendEnvFile(runtime, "GITHUB_STEP_SUMMARY", block);
  runtime.proc.stdout.write(block);
}

/**
 * Run the engage command: read both latch scopes, then write when the policy
 * allows it.
 * @param {object} ctx - The libcli invocation context. `ctx.deps.request`
 *   replaces the transport and `ctx.deps.fetchImpl` replaces only its fetch,
 *   so a test reaches every branch with no network.
 * @returns {Promise<{ok: boolean, code?: number, error?: string}>} The envelope.
 */
export async function runEngageCommand(ctx) {
  const { options, deps } = ctx;
  const { runtime } = deps;
  const { proc } = runtime;

  // Refuse an empty reason before anything else. Every killswitch reader
  // treats a falsy value as "not stopped", so an unguarded write would clear
  // the latch rather than set it.
  const reason = String(options.reason ?? "").trim();
  if (!reason) {
    proc.stderr.write("engage refuses an empty --reason\n");
    return { ok: false, code: 1 };
  }

  const variable = String(options.variable ?? "").trim();
  if (!variable) {
    return { ok: false, error: "engage requires --variable" };
  }
  const windowHours = positiveNumber(options["window-hours"]);
  if (windowHours === null) {
    return {
      ok: false,
      error: "engage requires --window-hours as a positive number",
    };
  }

  const repo = resolveRepo(options, proc);
  if (!repo) {
    return { ok: false, error: "engage requires --repo as owner/repo" };
  }
  const token = proc.env.GH_TOKEN;
  if (!token && !deps.request) {
    return { ok: false, error: "engage requires GH_TOKEN in the environment" };
  }

  const request =
    deps.request ??
    createRequest({
      token,
      clock: runtime.clock,
      fetchImpl: deps.fetchImpl,
    });
  const latch = createActionsVariableLatch({ request, repo, name: variable });

  let state;
  try {
    state = await latch.read();
  } catch (error) {
    proc.stderr.write(`engage cannot read the latch: ${error.message}\n`);
    return { ok: false, code: 1 };
  }

  if (options["dry-run"]) {
    await report(runtime, { state, dryRun: true });
    return { ok: true };
  }

  const decision = decide(state, {
    windowMs: windowHours * HOUR_MS,
    now: runtime.clock.now(),
  });
  if (decision === "skip") {
    await report(runtime, { state, decision });
    return { ok: true };
  }

  // The latch's only writer never produces a falsy value.
  if (!isTruthy(reason)) {
    proc.stderr.write("engage refuses a falsy reason\n");
    return { ok: false, code: 1 };
  }

  try {
    await latch.write(reason);
  } catch (error) {
    proc.stderr.write(`engage cannot write the latch: ${error.message}\n`);
    return { ok: false, code: 1 };
  }

  await report(runtime, { state, decision });
  // An engaging run exits non-zero, so it stands out red in the Actions list.
  return { ok: false, code: 1 };
}
