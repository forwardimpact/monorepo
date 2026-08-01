// @ts-check

// Bun FFI wrapper for posix_spawn (macOS only).
//
// The scheduler uses this when it runs inside fit-outpost.app. Child
// processes (claude) then inherit TCC attributes from the responsible binary.

import { dlopen, ptr } from "bun:ffi";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

// responsibility_spawnattrs_setdisclaim controls the TCC "responsible
// process" of the spawned child. With disclaim = 1 the child becomes
// responsible for itself. With disclaim = 0 the child keeps the parent
// chain's responsible process. macOS then attributes the child's access to
// fit-outpost.app. The code below passes 0 by default.
const {
  symbols: { responsibility_spawnattrs_setdisclaim: setDisclaim },
} = dlopen("/usr/lib/system/libquarantine.dylib", {
  responsibility_spawnattrs_setdisclaim: {
    args: ["pointer", "i32"],
    returns: "i32",
  },
});

// Bun's dlopen requires the `args`/`returns` field names. The `parameters`/
// `result` aliases silently return undefined and cause null-pointer crashes.
const libc = dlopen("libSystem.B.dylib", {
  posix_spawn: {
    args: [
      "pointer", // pid_t *pid
      "buffer", // const char *path
      "pointer", // posix_spawn_file_actions_t *
      "pointer", // posix_spawnattr_t *
      "pointer", // char *const argv[]
      "pointer", // char *const envp[]
    ],
    returns: "i32",
  },
  posix_spawnattr_init: {
    args: ["pointer"],
    returns: "i32",
  },
  posix_spawnattr_destroy: {
    args: ["pointer"],
    returns: "i32",
  },
  posix_spawn_file_actions_init: {
    args: ["pointer"],
    returns: "i32",
  },
  posix_spawn_file_actions_adddup2: {
    args: ["pointer", "i32", "i32"], // file_actions, fd, newfd
    returns: "i32",
  },
  posix_spawn_file_actions_addchdir_np: {
    args: ["pointer", "buffer"], // file_actions, path
    returns: "i32",
  },
  posix_spawn_file_actions_destroy: {
    args: ["pointer"],
    returns: "i32",
  },
  waitpid: {
    args: ["i32", "pointer", "i32"],
    returns: "i32",
  },
});

const WNOHANG = 1;

/**
 * Encode a string as a null-terminated C string buffer.
 * @param {string} str
 * @returns {Uint8Array}
 */
function cstr(str) {
  return new TextEncoder().encode(str + "\0");
}

/**
 * Build a C-style string array (char *const[]) from JS strings.
 * Returns the pointer array and the buffers. The caller must keep the
 * references alive.
 * @param {string[]} strings
 * @returns {{ pointer: BigInt64Array, buffers: Uint8Array[] }}
 */
function buildStringArray(strings) {
  const buffers = strings.map(cstr);
  const pointers = new BigInt64Array(buffers.length + 1); // null-terminated
  for (let i = 0; i < buffers.length; i++) {
    pointers[i] = BigInt(ptr(buffers[i]));
  }
  pointers[buffers.length] = 0n; // NULL terminator
  return { pointer: pointers, buffers };
}

/**
 * Read captured output from a temp file and clean up.
 * @param {string} filePath
 * @param {object} [runtime] - Runtime collaborator bag
 * @returns {string}
 */
export function readOutput(filePath, runtime) {
  const { fsSync } = runtime;
  try {
    return fsSync.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  } finally {
    try {
      fsSync.unlinkSync(filePath);
    } catch {
      // temp file may already be gone
    }
  }
}

/**
 * Spawn a child process with posix_spawn. TCC attributes then inherit from
 * the process that calls it (the responsible binary).
 *
 * This function captures stdout and stderr in temp files. Call
 * `waitForExit()` with the PID. Then call `readOutput()` on the returned
 * file paths.
 *
 * @param {string} executable - Absolute path to the executable
 * @param {string[]} args - Arguments (argv[0] should be the executable name)
 * @param {Record<string, string>} [env] - Environment (defaults to current)
 * @param {string} [cwd] - Working directory for the child process
 * @param {object} [runtime] - Runtime collaborator bag
 * @param {0|1} [disclaim=0] - TCC responsibility for the child. `0` keeps the
 *   parent chain's responsible process. The child's access then attributes to
 *   that process, for example fit-outpost.app. One grant covers the subtree.
 *   `1` makes the child responsible for itself. The parent's grants do not
 *   extend to it.
 * @returns {{ pid: number, stdoutFile: string, stderrFile: string }}
 */
export function spawn(executable, args, env, cwd, runtime, disclaim = 0) {
  const { proc, clock, fsSync } = runtime;
  const argv = buildStringArray([executable, ...args]);
  const envObj = env ?? { ...proc.env };
  const envStrings = Object.entries(envObj)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => `${k}=${v}`);
  const envp = buildStringArray(envStrings);

  // Capture stdout/stderr in temp files instead of pipes. The tag must be
  // unique across concurrent spawns. `runtime.proc` exposes no pid, so a
  // random UUID replaces the former `${pid}-${Date.now()}` scheme.
  // clock.now() alone is not unique within a millisecond.
  const tag = `outpost-${clock.now()}-${randomUUID()}`;
  const stdoutFile = join(tmpdir(), `${tag}-stdout`);
  const stderrFile = join(tmpdir(), `${tag}-stderr`);
  const stdoutFd = fsSync.openSync(stdoutFile, "w", 0o600);
  const stderrFd = fsSync.openSync(stderrFile, "w", 0o600);

  // Allocate attr and file_actions on the heap
  const attrBuf = new Uint8Array(512); // posix_spawnattr_t is opaque. 512 is generous
  const fileActionsBuf = new Uint8Array(512);
  const attr = ptr(attrBuf);
  const fa = ptr(fileActionsBuf);

  libc.symbols.posix_spawnattr_init(attr);

  // Apply the TCC responsibility for this wake. With disclaim = 0 the child
  // keeps the parent chain's responsible process. macOS then attributes its
  // access to fit-outpost.app, and a single grant to the app covers the whole
  // subtree. With disclaim = 1 the child is responsible for itself. The app's
  // grants do not extend to it. Least-privilege agents use this value. See
  // products/outpost/macos/TCC-VERIFICATION.md.
  setDisclaim(attr, disclaim);

  libc.symbols.posix_spawn_file_actions_init(fa);

  // Set the working directory if the caller provides one
  if (cwd) {
    libc.symbols.posix_spawn_file_actions_addchdir_np(fa, cstr(cwd));
  }

  // Redirect child stdout (fd 1) and stderr (fd 2) to temp files
  libc.symbols.posix_spawn_file_actions_adddup2(fa, stdoutFd, 1);
  libc.symbols.posix_spawn_file_actions_adddup2(fa, stderrFd, 2);

  const pidBuf = new Int32Array(1);

  const result = libc.symbols.posix_spawn(
    ptr(pidBuf),
    cstr(executable),
    fa,
    attr,
    ptr(argv.pointer),
    ptr(envp.pointer),
  );

  // Close the file fds in the parent. The child has its own copies.
  fsSync.closeSync(stdoutFd);
  fsSync.closeSync(stderrFd);

  libc.symbols.posix_spawnattr_destroy(attr);
  libc.symbols.posix_spawn_file_actions_destroy(fa);

  if (result !== 0) {
    try {
      fsSync.unlinkSync(stdoutFile);
    } catch {
      // cleanup best-effort
    }
    try {
      fsSync.unlinkSync(stderrFile);
    } catch {
      // cleanup best-effort
    }
    throw new Error(`posix_spawn failed with error code ${result}`);
  }

  return { pid: pidBuf[0], stdoutFile, stderrFile };
}

/**
 * Wait for a child process to exit (non-blocking poll).
 * Uses WNOHANG so the event loop does not block.
 * @param {number} pid
 * @param {number} [pollIntervalMs=100] - Interval between polls in milliseconds
 * @param {object} [runtime] - Runtime collaborator bag
 * @returns {Promise<number>} Exit status
 */
export async function waitForExit(pid, pollIntervalMs = 100, runtime) {
  const { clock } = runtime;
  const status = new Int32Array(1);
  while (true) {
    const result = libc.symbols.waitpid(pid, ptr(status), WNOHANG);
    if (result > 0) {
      // WEXITSTATUS: (status >> 8) & 0xff
      return (status[0] >> 8) & 0xff;
    }
    // The child still runs. Yield to the event loop.
    await clock.sleep(pollIntervalMs);
  }
}
