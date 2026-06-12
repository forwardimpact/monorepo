import { CSVIntegrityError } from "../csv.js";

// CSVIntegrityError carries line number + content; the command layer owns
// the file path, so the envelope prepends it. Anything else is a bug and
// keeps propagating.
/** Run a CSV-parsing thunk; on CSVIntegrityError return a CLI error envelope naming the file, otherwise `{ok: true, value}`. */
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
