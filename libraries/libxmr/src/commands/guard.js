import { CSVIntegrityError } from "../csv.js";

// CSVIntegrityError carries the line number and the content. The command
// layer owns the file path, so the envelope prepends it. Any other error
// is a bug. It propagates.
/** Run a CSV-parsing thunk. On CSVIntegrityError, return a CLI error envelope that names the file. Otherwise return `{ok: true, value}`. */
export function withIntegrityGuard(csvPath, fn) {
  try {
    return { ok: true, value: fn() };
  } catch (err) {
    if (err instanceof CSVIntegrityError) {
      return {
        ok: false,
        code: 2,
        error: `cannot parse CSV "${csvPath}": ${err.message}`,
      };
    }
    throw err;
  }
}
