/**
 * Invariants — runs `<task.paths.hooks>/invariants.sh` from the template path
 * against the post-run agent CWD. The exit code is authoritative for the
 * verdict; structured per-check rows arrive on fd 3 (`$RESULTS_FD=3`) as NDJSON.
 *
 * Subprocess access flows through `runtime.subprocess.spawn`; the fd-3 backing
 * store and the stderr log use the sync filesystem surface (`runtime.fsSync`) —
 * the only surface this module touches, per design Decision 7.
 */

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
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {Promise<InvariantsResult>}
 */
export async function runInvariants(task, ctx, runtime) {
  if (!runtime) throw new Error("runtime is required");
  if (!task.paths.invariants) {
    return { verdict: "pass", details: [], exitCode: 0 };
  }
  const fsSync = runtime.fsSync;
  const script = task.paths.invariants;
  const stderrLogPath = join(ctx.runDir, "invariants.stderr.log");

  // Bun's child_process pipe setup for fd >= 3 is racy under load (it
  // creates a unix socket pair and the connect() can return ENOENT). Use
  // a temp file as the fd-3 backing store instead — the script still
  // writes via `$RESULTS_FD`, but we hand it a real file descriptor.
  const fd3Path = join(ctx.runDir, "invariants.fd3.ndjson");
  const fd3File = fsSync.openSync(fd3Path, "w+");

  let child;
  try {
    child = runtime.subprocess.spawn(script, [], {
      env: {
        ...runtime.proc.env,
        WORKDIR: ctx.cwd,
        PORT: String(ctx.port),
        RESULTS_FD: "3",
      },
      stdio: ["inherit", "pipe", "pipe", fd3File],
    });
  } catch (e) {
    tryClose(fsSync, fd3File);
    throw e;
  }

  // Drain stdout (do not require consumers to read it); capture stderr to log.
  const drainStdout = (async () => {
    for await (const _chunk of child.stdout) {
      // discard
    }
  })();
  let stderr = "";
  for await (const chunk of child.stderr) stderr += chunk.toString();
  await drainStdout;
  const code = await child.exitCode;

  fsSync.writeFileSync(stderrLogPath, stderr);
  tryClose(fsSync, fd3File);

  const raw = readAndUnlink(fsSync, fd3Path);
  const details = [];
  parseFd3Buffer(raw, details);
  const exitCode = typeof code === "number" ? code : -1;
  return {
    verdict: exitCode === 0 ? "pass" : "fail",
    details,
    exitCode,
  };
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

function tryClose(fsSync, fd) {
  try {
    fsSync.closeSync(fd);
  } catch {
    // already closed
  }
}

function readAndUnlink(fsSync, path) {
  let raw = "";
  try {
    raw = fsSync.readFileSync(path, "utf8");
  } catch {
    // empty
  }
  try {
    fsSync.unlinkSync(path);
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
