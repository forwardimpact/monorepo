import { resolve } from "node:path";
import { generateSecret, getOrGenerateSecret } from "@forwardimpact/libsecret";
import { bootstrapProject } from "@forwardimpact/libconfig";
import {
  SummaryRenderer,
  formatHeader,
  formatSuccess,
  formatError,
} from "@forwardimpact/libcli";

/**
 * Bootstrap a Guide project by generating secrets, writing default service
 * URLs to .env, and copying starter configuration.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators.
 * @returns {Promise<{ok: boolean, code?: number}>} Result envelope; the bin shim
 *   translates a falsy `ok` into a non-zero exit.
 */
export async function runInitCommand(runtime) {
  const { fs, proc } = runtime;
  const serviceSecret = await getOrGenerateSecret(
    "SERVICE_SECRET",
    () => generateSecret(),
    ".env",
    runtime,
  );
  const mcpToken = await getOrGenerateSecret(
    "MCP_TOKEN",
    () => generateSecret(),
    ".env",
    runtime,
  );

  const starterDir = new URL("../../starter", import.meta.url).pathname;
  const skillsDir = resolve(".claude", "skills");

  try {
    await fs.access(starterDir);
  } catch {
    proc.stderr.write(formatError("Starter data not found in package.") + "\n");
    return { ok: false, code: 1 };
  }

  const starterConfig = JSON.parse(
    await fs.readFile(resolve(starterDir, "config.json"), "utf8"),
  );

  await bootstrapProject({
    deps: { runtime },
    fragment: starterConfig,
    env: {
      SERVICE_SECRET: serviceSecret,
      MCP_TOKEN: mcpToken,
      SERVICE_SPAN_URL: "grpc://localhost:3001",
      SERVICE_VECTOR_URL: "grpc://localhost:3002",
      SERVICE_GRAPH_URL: "grpc://localhost:3003",
      SERVICE_PATHWAY_URL: "grpc://localhost:3005",
      SERVICE_MAP_URL: "grpc://localhost:3004",
      SERVICE_MCP_URL: "http://localhost:3011",
      SERVICE_EMBEDDING_URL: "grpc://localhost:3015",
    },
  });

  // Ensure package.json exists (needed by fit-codegen for project root detection)
  const pkgPath = resolve("package.json");
  try {
    await fs.access(pkgPath);
  } catch {
    await fs.writeFile(
      pkgPath,
      JSON.stringify(
        {
          name: "my-guide-project",
          version: "0.1.0",
          type: "module",
          private: true,
        },
        null,
        2,
      ) + "\n",
    );
    proc.stdout.write(formatSuccess("package.json created.") + "\n");
  }

  const summary = new SummaryRenderer({ process: proc });
  summary.render({
    title: formatHeader("Environment (.env)"),
    ok: true,
    items: [
      { label: "SERVICE_SECRET", description: "generated" },
      { label: "MCP_TOKEN", description: "generated" },
      { label: "Service URLs", description: "ports 3001–3015" },
      {
        label: "ANTHROPIC_API_KEY",
        description: "set manually or run fit-guide login",
      },
    ],
  });
  if (summary.shouldRender(true)) proc.stdout.write("\n");

  // Copy skills → .claude/skills/
  const starterSkills = resolve(starterDir, "skills");
  try {
    await fs.access(starterSkills);
    await fs.mkdir(skillsDir, { recursive: true });
    await fs.cp(starterSkills, skillsDir, { recursive: true });
    proc.stdout.write(
      formatSuccess(".claude/skills/ created with starter skills.") + "\n",
    );
  } catch {
    // No starter skills directory — skip silently
  }

  return { ok: true };
}
