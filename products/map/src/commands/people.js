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

/** Validate a people roster file against the known levels and disciplines. */
export async function validate(filePath, dataDir, runtime) {
  runtime.proc.stdout.write(
    formatHeader(`Validating people file: ${filePath}`) + "\n\n",
  );
  const people = await loadPeopleFile(filePath, runtime);
  runtime.proc.stdout.write(
    formatBullet(`Loaded ${people.length} people from file`, 0) + "\n",
  );

  const { valid, errors } = await validatePeople(people, dataDir, runtime);
  if (errors.length > 0) {
    runtime.proc.stdout.write("\n" + formatHeader("Validation errors") + "\n");
    for (const err of errors) {
      runtime.proc.stdout.write(
        formatBullet(`Row ${err.row}: ${err.message}`, 0) + "\n",
      );
    }
  }

  runtime.proc.stdout.write(
    "\n" + formatSuccess(`${valid.length} people validated`) + "\n",
  );
  if (errors.length > 0) {
    runtime.proc.stdout.write(
      formatError(`${errors.length} rows with errors`) + "\n\n",
    );
    return 1;
  }
  return 0;
}

/** Upload a people roster file to Supabase storage and transform it into the organization_people table. */
export async function push(filePath, supabase, runtime) {
  runtime.proc.stdout.write(
    formatHeader(`Pushing people file: ${filePath}`) + "\n\n",
  );
  const content = await runtime.fs.readFile(filePath, "utf-8");
  const format = filePath.endsWith(".csv") ? "csv" : "yaml";

  const extractResult = await extractPeopleFile(
    supabase,
    content,
    format,
    runtime,
  );
  if (!extractResult.stored) {
    runtime.proc.stderr.write(
      formatError(`Failed to store raw file: ${extractResult.error}`) + "\n",
    );
    return 1;
  }
  runtime.proc.stdout.write(
    formatBullet(`Stored raw file: ${extractResult.path}`, 0) + "\n",
  );

  const result = await transformPeople(supabase, runtime);
  runtime.proc.stdout.write(
    "\n" + formatSuccess(`Imported ${result.imported} people`) + "\n",
  );
  if (result.errors.length > 0) {
    runtime.proc.stderr.write(
      formatError(`${result.errors.length} transform errors:`) + "\n",
    );
    for (const err of result.errors) {
      runtime.proc.stderr.write(formatBullet(err, 1) + "\n");
    }
    return 1;
  }
  return 0;
}
