/**
 * Init Command
 *
 * Initializes a new Engineering Pathway project by copying example data.
 */

import { cp, access } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const examplesDir = join(__dirname, "..", "..", "examples");

/**
 * Run the init command
 * @param {Object} params - Command parameters
 * @param {Object} params.options - Command options
 */
export async function runInitCommand({ options }) {
  const targetPath = options.path || process.cwd();
  const dataDir = join(targetPath, "data");

  // Check if data/ already exists
  try {
    await access(dataDir);
    console.error("Error: ./data/ already exists.");
    console.error("Remove it first or use a different directory.");
    process.exit(1);
  } catch {
    // Directory doesn't exist, proceed
  }

  // Check if examples directory exists
  try {
    await access(examplesDir);
  } catch {
    console.error("Error: Examples directory not found in package.");
    console.error("This may indicate a corrupted package installation.");
    process.exit(1);
  }

  // Copy example data
  console.log("Creating ./data/ with example data...\n");
  await cp(examplesDir, dataDir, { recursive: true });

  console.log(`✅ Created ./data/ with example data.

Next steps:
  1. Edit data files to match your organization
  2. npx pathway --validate
  3. npx pathway serve

Data structure:
  data/
  ├── framework.yaml      # Framework metadata
  ├── grades.yaml         # Career levels
  ├── stages.yaml         # Lifecycle stages
  ├── drivers.yaml        # Business drivers
  ├── capabilities.yaml   # Capability areas
  ├── disciplines/        # Engineering disciplines
  ├── tracks/             # Role tracks
  ├── skills/             # Technical skills
  ├── behaviours/         # Behavioural expectations
  └── questions/          # Interview questions
`);
}
