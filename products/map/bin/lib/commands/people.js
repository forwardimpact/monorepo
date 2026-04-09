import { readFile } from "fs/promises";
import {
  loadPeopleFile,
  validatePeople,
} from "@forwardimpact/map/activity/validate/people";
import { extractPeopleFile } from "@forwardimpact/map/activity/extract/people";
import { transformPeople } from "@forwardimpact/map/activity/transform/people";

export async function validate(filePath, dataDir) {
  console.log(`Validating people file: ${filePath}\n`);
  const people = await loadPeopleFile(filePath);
  console.log(`  Loaded ${people.length} people from file`);

  const { valid, errors } = await validatePeople(people, dataDir);
  if (errors.length > 0) {
    console.log(`\nValidation errors:`);
    for (const err of errors) {
      console.log(`  - Row ${err.row}: ${err.message}`);
    }
  }

  console.log(`\n${valid.length} people validated`);
  if (errors.length > 0) {
    console.log(`${errors.length} rows with errors\n`);
    return 1;
  }
  return 0;
}

export async function push(filePath, supabase) {
  console.log(`Pushing people file: ${filePath}\n`);
  const content = await readFile(filePath, "utf-8");
  const format = filePath.endsWith(".csv") ? "csv" : "yaml";

  const extractResult = await extractPeopleFile(supabase, content, format);
  if (!extractResult.stored) {
    console.error(`Failed to store raw file: ${extractResult.error}`);
    return 1;
  }
  console.log(`  Stored raw file: ${extractResult.path}`);

  const result = await transformPeople(supabase);
  console.log(`\nImported ${result.imported} people`);
  if (result.errors.length > 0) {
    console.error(`${result.errors.length} transform errors:`);
    for (const err of result.errors) console.error(`  - ${err}`);
    return 1;
  }
  return 0;
}
