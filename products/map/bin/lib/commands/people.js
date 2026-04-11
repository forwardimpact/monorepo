import { readFile } from "fs/promises";
import {
  loadPeopleFile,
  validatePeople,
} from "@forwardimpact/map/activity/validate/people";
import { extractPeopleFile } from "@forwardimpact/map/activity/extract/people";
import { transformPeople } from "@forwardimpact/map/activity/transform/people";
import {
  formatHeader,
  formatSuccess,
  formatError,
  formatBullet,
} from "@forwardimpact/libcli";

export async function validate(filePath, dataDir) {
  process.stdout.write(
    formatHeader(`Validating people file: ${filePath}`) + "\n\n",
  );
  const people = await loadPeopleFile(filePath);
  process.stdout.write(
    formatBullet(`Loaded ${people.length} people from file`, 0) + "\n",
  );

  const { valid, errors } = await validatePeople(people, dataDir);
  if (errors.length > 0) {
    process.stdout.write("\n" + formatHeader("Validation errors") + "\n");
    for (const err of errors) {
      process.stdout.write(
        formatBullet(`Row ${err.row}: ${err.message}`, 0) + "\n",
      );
    }
  }

  process.stdout.write(
    "\n" + formatSuccess(`${valid.length} people validated`) + "\n",
  );
  if (errors.length > 0) {
    process.stdout.write(
      formatError(`${errors.length} rows with errors`) + "\n\n",
    );
    return 1;
  }
  return 0;
}

export async function push(filePath, supabase) {
  process.stdout.write(
    formatHeader(`Pushing people file: ${filePath}`) + "\n\n",
  );
  const content = await readFile(filePath, "utf-8");
  const format = filePath.endsWith(".csv") ? "csv" : "yaml";

  const extractResult = await extractPeopleFile(supabase, content, format);
  if (!extractResult.stored) {
    process.stderr.write(
      formatError(`Failed to store raw file: ${extractResult.error}`) + "\n",
    );
    return 1;
  }
  process.stdout.write(
    formatBullet(`Stored raw file: ${extractResult.path}`, 0) + "\n",
  );

  const result = await transformPeople(supabase);
  process.stdout.write(
    "\n" + formatSuccess(`Imported ${result.imported} people`) + "\n",
  );
  if (result.errors.length > 0) {
    process.stderr.write(
      formatError(`${result.errors.length} transform errors:`) + "\n",
    );
    for (const err of result.errors) {
      process.stderr.write(formatBullet(err, 1) + "\n");
    }
    return 1;
  }
  return 0;
}
