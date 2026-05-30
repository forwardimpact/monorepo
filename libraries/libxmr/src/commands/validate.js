import {
  formatHeader,
  formatSuccess,
  formatError,
  formatBullet,
} from "@forwardimpact/libcli";

import { validateCSV } from "../csv.js";

/** Run the validate command: check a CSV file for structural and field-level errors. */
export function runValidateCommand(ctx) {
  const {
    options: values,
    args,
    deps: { runtime },
  } = ctx;
  const { fsSync, proc } = runtime;

  const csvPath = args["csv-path"];
  if (!csvPath) {
    return {
      ok: false,
      code: 2,
      error: "validate requires a <csv-path> argument",
    };
  }
  if (!fsSync.existsSync(csvPath)) {
    return {
      ok: false,
      code: 2,
      error: `cannot read CSV "${csvPath}": file not found`,
    };
  }

  const text = fsSync.readFileSync(csvPath, "utf-8");
  const result = validateCSV(text);
  result.source = csvPath;

  if (values.format === "json") {
    proc.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    proc.stdout.write(formatValidationText(csvPath, result) + "\n");
  }

  if (!result.valid) return { ok: false, code: 1 };
  return { ok: true };
}

function formatValidationText(csvPath, result) {
  const parts = [formatHeader(`Validate — ${csvPath}`), `Rows: ${result.rows}`];

  if (result.valid) {
    parts.push(formatSuccess("Valid"));
  } else {
    parts.push(formatError(`${result.errors.length} error(s)`));
    for (const e of result.errors) {
      const loc = e.field ? `line ${e.line} [${e.field}]` : `line ${e.line}`;
      parts.push(formatBullet(`${loc}: ${e.message}`));
    }
  }

  return parts.join("\n");
}
