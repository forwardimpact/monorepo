/**
 * Invariants — runs `<task.paths.hooks>/invariants.sh` from the template path
 * against the post-run agent CWD. The exit code is authoritative for the
 * verdict; structured per-check rows arrive on fd 3 (`$RESULTS_FD=3`) as NDJSON.
 */

import { spawn } from "node:child_process";
import {
  closeSync,
  createWriteStream,
  openSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

/**
 * @typedef {object} InvariantsResult
 * @property {"pass" | "fail"} verdict
 * @property {Array<object>} details
 * @property {number} exitCode
 */

/**
 * Run the task's invariants script.
 * @param {import("./task-family.js").Task} task
 * @param {{cwd: string, port: number, runDir: string}} ctx
 * @returns {Promise<InvariantsResult>}
 */
export function runInvariants(task, ctx) {
  if (!task.paths.invariants) {
    return Promise.resolve({ verdict: "pass", details: [], exitCode: 0 });
  }
  return new Promise((res, rej) => {
    const script = task.paths.invariants;
    const stderrLog = createWriteStream(
      join(ctx.runDir, "invariants.stderr.log"),
    );

    // Bun's child_process pipe setup for fd >= 3 is racy under load (it
    // creates a unix socket pair and the connect() can return ENOENT). Use
    // a temp file as the fd-3 backing store instead — the script still
    // writes via `$RESULTS_FD`, but we hand it a real file descriptor.
    const fd3Path = join(ctx.runDir, "invariants.fd3.ndjson");
    let fd3File;
    try {
      fd3File = openSync(fd3Path, "w+");
    } catch (e) {
      rej(e);
      return;
    }

    const child = spawn(script, [], {
      env: {
        ...process.env,
        WORKDIR: ctx.cwd,
        PORT: String(ctx.port),
        RESULTS_FD: "3",
      },
      stdio: ["inherit", "pipe", "pipe", fd3File],
    });
    if (child.pid === undefined) {
      try {
        closeSync(fd3File);
      } catch {
        // already closed
      }
      rej(new Error(`failed to spawn invariants script: ${script}`));
      return;
    }

    child.stderr.pipe(stderrLog);
    // Drain stdout (do not require consumers to read it).
    child.stdout.on("data", () => {});

    child.on("error", (e) => {
      tryClose(fd3File);
      rej(e);
    });
    child.on("close", (code) => {
      stderrLog.end();
      tryClose(fd3File);
      const raw = readAndUnlink(fd3Path);
      const details = [];
      parseFd3Buffer(raw, details);
      const exitCode = typeof code === "number" ? code : -1;
      res({
        verdict: exitCode === 0 ? "pass" : "fail",
        details,
        exitCode,
      });
    });
  });
}

function pushRow(line, details) {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    details.push(JSON.parse(trimmed));
  } catch {
    details.push({ raw: trimmed, parseError: true });
  }
}

function tryClose(fd) {
  try {
    closeSync(fd);
  } catch {
    // already closed
  }
}

function readAndUnlink(path) {
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    // empty
  }
  try {
    unlinkSync(path);
  } catch {
    // best-effort cleanup
  }
  return raw;
}

/**
 * Parse the fd-3 buffer (read from the temp-file backing) into one NDJSON
 * row per detail entry.
 */
function parseFd3Buffer(buf, details) {
  if (!buf) return;
  const parts = buf.split("\n");
  for (let i = 0; i < parts.length - 1; i++) pushRow(parts[i], details);
  if (parts[parts.length - 1].trim()) {
    pushRow(parts[parts.length - 1], details);
  }
}
