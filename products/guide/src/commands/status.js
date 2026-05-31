import { SummaryRenderer } from "@forwardimpact/libcli";
import { runStatus } from "../lib/status.js";

function printStatusSummary(summary, result, proc) {
  const ok = result.verdict === "ready";

  summary.render({
    title: "Services",
    ok,
    items: Object.entries(result.services).map(([name, info]) => ({
      label: name,
      description: `${info.status === "ok" ? "ok" : "unreachable"}  ${info.url}`,
    })),
  });

  summary.render({
    title: "Data",
    ok,
    items: [
      { label: "resources", description: String(result.data.resources) },
      { label: "triples", description: String(result.data.triples) },
    ],
  });

  summary.render({
    title: "Credentials",
    ok,
    items: [
      {
        label: "ANTHROPIC_API_KEY",
        description: result.credentials.ANTHROPIC_API_KEY,
      },
    ],
  });

  if (summary.shouldRender(ok)) proc.stdout.write("\n");
  proc.stdout.write(`Status: ${result.verdict}\n`);
}

/**
 * Check Guide service health, data counts, and credentials, returning a
 * ready/not-ready verdict.
 * @param {object} options - Command options.
 * @param {boolean} options.json - Emit machine-readable JSON instead of a summary.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators.
 * @returns {Promise<number>} 0 when ready, 1 otherwise.
 */
export async function runStatusCommand({ json }, runtime) {
  const { proc, clock, fs } = runtime;
  const { createServiceConfig } = await import("@forwardimpact/libconfig");
  const { healthDefinition } = await import("@forwardimpact/librpc");
  const grpcMod = (await import("@grpc/grpc-js")).default;

  const result = await runStatus({
    createServiceConfig,
    grpc: grpcMod,
    healthDefinition,
    fs,
    clock,
  });

  if (json) {
    proc.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    const summary = new SummaryRenderer({ process: proc });
    printStatusSummary(summary, result, proc);
  }

  return result.verdict === "ready" ? 0 : 1;
}
