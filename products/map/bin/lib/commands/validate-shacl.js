/**
 * SHACL validation command
 *
 * Parses every .ttl file under schema/rdf/ and reports syntax errors.
 */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  formatHeader,
  formatSuccess,
  formatError,
  formatBullet,
} from "@forwardimpact/libcli";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Validate SHACL/Turtle schemas in the package.
 * @returns {Promise<number>} exit code
 */
export async function runValidateShacl() {
  process.stdout.write(formatHeader("Validating SHACL schema syntax") + "\n\n");

  const rdfDir = join(__dirname, "..", "..", "..", "schema", "rdf");

  try {
    const { default: N3 } = await import("n3");
    const { readFile, readdir } = await import("fs/promises");

    const files = await readdir(rdfDir);
    const ttlFiles = files.filter((f) => f.endsWith(".ttl")).sort();

    if (ttlFiles.length === 0) {
      process.stderr.write(
        formatError("No .ttl files found in schema/rdf/") + "\n",
      );
      return 1;
    }

    let totalQuads = 0;
    const errors = [];

    for (const file of ttlFiles) {
      const filePath = join(rdfDir, file);
      const turtleContent = await readFile(filePath, "utf-8");

      try {
        const parser = new N3.Parser({ format: "text/turtle" });
        const quads = parser.parse(turtleContent);
        totalQuads += quads.length;
        process.stdout.write(
          formatBullet(`${file} (${quads.length} triples)`, 0) + "\n",
        );
      } catch (error) {
        errors.push({ file, error: error.message });
        process.stdout.write(
          formatBullet(`${file}: ${error.message}`, 0) + "\n",
        );
      }
    }

    process.stdout.write("\n");
    if (errors.length > 0) {
      process.stderr.write(
        formatError(`SHACL syntax errors in ${errors.length} file(s)`) + "\n",
      );
      return 1;
    }

    process.stdout.write(
      formatSuccess(
        `SHACL syntax valid (${ttlFiles.length} files, ${totalQuads} triples)`,
      ) + "\n",
    );
    return 0;
  } catch (error) {
    process.stderr.write(
      formatError(`SHACL validation error: ${error.message}`) + "\n",
    );
    return 1;
  }
}
