/**
 * Pick-memory log for the `substrate pick` verb. Append-only CSV at a
 * caller-supplied path. Schema: `picked_at,persona_email,run_id`. CSV
 * quoting is deliberately omitted — all three values are bounded shapes
 * (ISO timestamp, email, numeric CI run id) with no commas or newlines.
 */

import path from "node:path";
import { isoTimestamp } from "@forwardimpact/libutil";

const HEADER = "picked_at,persona_email,run_id";

/**
 * Read the last `windowN` `persona_email` values from the pick log.
 * Returns an empty `Set` when the file does not exist or `windowN === 0`.
 *
 * @param {string} memoryPath - absolute path to the pick log CSV
 * @param {number} windowN
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (fs).
 * @returns {Promise<Set<string>>}
 */
export async function readPickMemory(memoryPath, windowN, runtime) {
  if (!windowN || windowN <= 0) return new Set();
  let text;
  try {
    text = await runtime.fs.readFile(memoryPath, "utf8");
  } catch (err) {
    if (err && err.code === "ENOENT") return new Set();
    throw err;
  }
  const lines = text.split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) return new Set();
  const dataLines = lines[0] === HEADER ? lines.slice(1) : lines;
  const emails = dataLines
    .map((line) => line.split(",")[1])
    .filter((email) => typeof email === "string" && email.length > 0);
  const tail = emails.slice(-windowN);
  return new Set(tail);
}

/**
 * Append one pick to the log. Creates the parent directory and the
 * header line when the file is absent. The caller supplies
 * `persona_email`; `picked_at` is stamped here; `run_id` defaults to the
 * empty string.
 *
 * @param {string} memoryPath
 * @param {{persona_email: string, run_id?: string}} entry
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (fs, clock).
 */
export async function appendPickMemory(memoryPath, entry, runtime) {
  await runtime.fs.mkdir(path.dirname(memoryPath), { recursive: true });
  const picked_at = isoTimestamp(runtime.clock.now());
  const run_id = entry.run_id ?? "";
  const row = `${picked_at},${entry.persona_email},${run_id}\n`;
  try {
    await runtime.fs.readFile(memoryPath, "utf8");
    await runtime.fs.appendFile(memoryPath, row);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      await runtime.fs.writeFile(memoryPath, `${HEADER}\n${row}`);
      return;
    }
    throw err;
  }
}
