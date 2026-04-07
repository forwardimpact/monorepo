// @ts-check

// Bun FFI wrapper for posix_spawn (macOS only).
//
// Used by the scheduler when running inside Basecamp.app so that child
// processes (claude) inherit TCC attributes from the responsible binary.

import { dlopen, ptr } from "bun:ffi";
import { openSync, closeSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// responsibility_spawnattrs_setdisclaim makes the spawned child disclaim
// TCC "responsible process" status, so macOS checks the parent's responsible
// process (Basecamp.app) instead.
const {
  symbols: { responsibility_spawnattrs_setdisclaim: setDisclaim },
} = dlopen("/usr/lib/system/libquarantine.dylib", {
  responsibility_spawnattrs_setdisclaim: {
    args: ["pointer", "i32"],
    returns: "i32",
  },
});

// Bun's dlopen requires `args`/`returns` field names — the `parameters`/
// `result` aliases silently return undefined, causing null-pointer crashes.
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
 * Returns the pointer array and the buffers (must keep references alive).
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
 * @returns {string}
 */
export function readOutput(filePath) {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return "";
  } finally {
    try {
      unlinkSync(filePath);
    } catch {}
  }
}

/**
 * Spawn a child process using posix_spawn so TCC attributes inherit from
 * the calling process (the responsible binary).
 *
 * Stdout and stderr are captured via temp files. Call `waitForExit()` with
 * the PID, then `readOutput()` on the returned file paths.
 *
 * @param {string} executable - Absolute path to the executable
 * @param {string[]} args - Arguments (argv[0] should be the executable name)
 * @param {Record<string, string>} [env] - Environment (defaults to current)
 * @param {string} [cwd] - Working directory for the child process
 * @returns {{ pid: number, stdoutFile: string, stderrFile: string }}
 */
export function spawn(executable, args, env, cwd) {
  const argv = buildStringArray([executable, ...args]);
  const envObj = env ?? { ...process.env };
  const envStrings = Object.entries(envObj)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => `${k}=${v}`);
  const envp = buildStringArray(envStrings);

  // Capture stdout/stderr via temp files instead of pipes.
  const tag = `basecamp-${process.pid}-${Date.now()}`;
  const stdoutFile = join(tmpdir(), `${tag}-stdout`);
  const stderrFile = join(tmpdir(), `${tag}-stderr`);
  const stdoutFd = openSync(stdoutFile, "w", 0o600);
  const stderrFd = openSync(stderrFile, "w", 0o600);

  // Allocate attr and file_actions on the heap
  const attrBuf = new Uint8Array(512); // posix_spawnattr_t is opaque, 512 is generous
  const fileActionsBuf = new Uint8Array(512);
  const attr = ptr(attrBuf);
  const fa = ptr(fileActionsBuf);

  libc.symbols.posix_spawnattr_init(attr);

  // Disclaim TCC responsibility so the child inherits the responsible
  // process from the parent chain (ultimately Basecamp.app).
  setDisclaim(attr, 1);

  libc.symbols.posix_spawn_file_actions_init(fa);

  // Set working directory if specified
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

  // Close file fds in the parent (child has its own copies)
  closeSync(stdoutFd);
  closeSync(stderrFd);

  libc.symbols.posix_spawnattr_destroy(attr);
  libc.symbols.posix_spawn_file_actions_destroy(fa);

  if (result !== 0) {
    try {
      unlinkSync(stdoutFile);
    } catch {}
    try {
      unlinkSync(stderrFile);
    } catch {}
    throw new Error(`posix_spawn failed with error code ${result}`);
  }

  return { pid: pidBuf[0], stdoutFile, stderrFile };
}

/**
 * Wait for a child process to exit (non-blocking poll).
 * Uses WNOHANG to avoid blocking the event loop.
 * @param {number} pid
 * @param {number} [pollIntervalMs=100] - Polling interval in milliseconds
 * @returns {Promise<number>} Exit status
 */
export async function waitForExit(pid, pollIntervalMs = 100) {
  const status = new Int32Array(1);
  while (true) {
    const result = libc.symbols.waitpid(pid, ptr(status), WNOHANG);
    if (result > 0) {
      // WEXITSTATUS: (status >> 8) & 0xff
      return (status[0] >> 8) & 0xff;
    }
    // Child not yet exited — yield to event loop
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
