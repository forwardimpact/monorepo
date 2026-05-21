/**
 * Pick-memory log for the `substrate pick` verb. Append-only CSV at
 * `wiki/kata-interview/picks.csv` (top-level skill-scoped directory).
 * Schema: `picked_at,persona_email,run_id`. CSV quoting is deliberately
 * omitted — all three values are bounded shapes (ISO timestamp, email,
 * numeric GitHub run id) with no commas or newlines.
 */

import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import path from "node:path";

const HEADER = "picked_at,persona_email,run_id";

/**
 * Read the last `windowN` `persona_email` values from the pick log.
 * Returns an empty `Set` when the file does not exist or `windowN === 0`.
 *
 * @param {string} memoryPath - absolute path to picks.csv
 * @param {number} windowN
 * @returns {Promise<Set<string>>}
 */
export async function readPickMemory(memoryPath, windowN) {
  if (!windowN || windowN <= 0) return new Set();
  let text;
  try {
    text = await readFile(memoryPath, "utf8");
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
 */
export async function appendPickMemory(memoryPath, entry) {
  await mkdir(path.dirname(memoryPath), { recursive: true });
  const picked_at = new Date().toISOString();
  const run_id = entry.run_id ?? "";
  const row = `${picked_at},${entry.persona_email},${run_id}\n`;
  try {
    await readFile(memoryPath, "utf8");
    await appendFile(memoryPath, row);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      await writeFile(memoryPath, `${HEADER}\n${row}`);
      return;
    }
    throw err;
  }
}
