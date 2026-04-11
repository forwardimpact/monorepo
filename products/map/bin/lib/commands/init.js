/**
 * Init Command
 *
 * Initializes a new framework data directory by copying starter data.
 */

import { cp, access } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  formatError,
  formatSuccess,
  formatHeader,
  formatBullet,
  indent,
} from "@forwardimpact/libcli";

const __dirname = dirname(fileURLToPath(import.meta.url));
const starterDir = join(__dirname, "..", "..", "..", "starter");

/**
 * Run the init command
 * @param {string} [targetPath] - Target directory (defaults to cwd)
 */
export async function runInit(targetPath) {
  const target = targetPath || process.cwd();
  const dataDir = join(target, "data", "pathway");

  // Check if data/pathway/ already exists
  try {
    await access(dataDir);
    process.stderr.write(formatError("./data/pathway/ already exists.") + "\n");
    process.stderr.write("Remove it first or use a different directory.\n");
    process.exit(1);
  } catch {
    // Directory doesn't exist, proceed
  }

  // Verify starter data is available
  try {
    await access(starterDir);
  } catch {
    process.stderr.write(
      formatError("Starter data not found in package.") + "\n",
    );
    process.stderr.write(
      "This may indicate a corrupted package installation.\n",
    );
    process.exit(1);
  }

  // Copy starter data
  process.stdout.write("Creating ./data/pathway/ with starter data...\n\n");
  await cp(starterDir, dataDir, { recursive: true });

  process.stdout.write(
    formatSuccess("Created ./data/pathway/ with starter data.") + "\n\n",
  );

  process.stdout.write(formatHeader("Next steps") + "\n");
  process.stdout.write(
    formatBullet("Edit data files to match your organization", 0) + "\n",
  );
  process.stdout.write(formatBullet("npx fit-map validate", 0) + "\n");
  process.stdout.write(formatBullet("npx fit-pathway dev", 0) + "\n\n");

  process.stdout.write(formatHeader("Data structure") + "\n");
  process.stdout.write(
    indent(
      `data/pathway/
\u251C\u2500\u2500 framework.yaml        # Framework metadata
\u251C\u2500\u2500 levels.yaml           # Career levels
\u251C\u2500\u2500 stages.yaml           # Lifecycle stages
\u251C\u2500\u2500 drivers.yaml          # Business drivers
\u251C\u2500\u2500 disciplines/          # Engineering disciplines
\u251C\u2500\u2500 capabilities/         # Capability areas with skills
\u251C\u2500\u2500 behaviours/           # Behavioural expectations
\u2514\u2500\u2500 tracks/               # Track specializations`,
      2,
    ) + "\n",
  );
}
