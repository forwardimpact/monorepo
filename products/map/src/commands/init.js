/**
 * Init Command
 *
 * Initializes a new standard data directory from the starter data.
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { bootstrapProject } from "@forwardimpact/libconfig";
import {
  formatError,
  formatSuccess,
  formatHeader,
  formatBullet,
  indent,
} from "@forwardimpact/libcli";

const __dirname = dirname(fileURLToPath(import.meta.url));
const starterDir = join(__dirname, "..", "..", "starter");

/**
 * Run the init command.
 *
 * Returns a result envelope (`{ ok }`). The bin translates a `false` `ok`
 * into a non-zero exit code. Only bins call `runtime.proc.exit` (design
 * Decision 4).
 *
 * @param {string|undefined} targetPath - Target directory (defaults to cwd)
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (fs, proc).
 * @returns {Promise<{ok: boolean, code?: number}>}
 */
export async function runInit(targetPath, runtime) {
  const target = targetPath || runtime.proc.cwd();
  const dataDir = join(target, "data", "pathway");

  // Verify the starter data is available
  try {
    await runtime.fs.access(starterDir);
  } catch {
    runtime.proc.stderr.write(
      formatError("Starter data not found in package.") + "\n",
    );
    runtime.proc.stderr.write(
      "This may indicate a corrupted package installation.\n",
    );
    return { ok: false, code: 1 };
  }

  // Copy the starter data. The copy is idempotent. Substrate stage can
  // then re-stage a workspace that `fit-map init` produced, as a no-op.
  runtime.proc.stdout.write(
    "Creating ./data/pathway/ with starter data...\n\n",
  );
  await runtime.fs.cp(starterDir, dataDir, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });

  // Materialise target/config/config.json so later fit-map invocations
  // anchor at the init target. Without it they walk upward into an
  // ancestor config/. This spec ships no product.map starter fragment.
  await bootstrapProject({ target, fragment: {}, deps: { runtime } });

  runtime.proc.stdout.write(
    formatSuccess("Created ./data/pathway/ with starter data.") + "\n\n",
  );

  runtime.proc.stdout.write(formatHeader("Next steps") + "\n");
  runtime.proc.stdout.write(
    formatBullet("Edit data files to match your organization", 0) + "\n",
  );
  runtime.proc.stdout.write(formatBullet("npx fit-map validate", 0) + "\n");
  runtime.proc.stdout.write(formatBullet("npx fit-pathway dev", 0) + "\n\n");

  runtime.proc.stdout.write(formatHeader("Data structure") + "\n");
  runtime.proc.stdout.write(
    indent(
      `data/pathway/
\u251C\u2500\u2500 standard.yaml        # Standard metadata
\u251C\u2500\u2500 levels.yaml           # Career levels
\u251C\u2500\u2500 drivers.yaml          # Business drivers
\u251C\u2500\u2500 disciplines/          # Engineering disciplines
\u251C\u2500\u2500 capabilities/         # Capability areas with skills
\u251C\u2500\u2500 behaviours/           # Behavioural expectations
\u2514\u2500\u2500 tracks/               # Track specializations`,
      2,
    ) + "\n",
  );

  return { ok: true };
}
