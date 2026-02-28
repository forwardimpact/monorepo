// @ts-check
/// <reference lib="deno.ns" />

// Deno FFI wrapper for posix_spawn (macOS only).
//
// Used by the scheduler when running inside Basecamp.app so that child
// processes (claude) inherit TCC attributes from the responsible binary.

// responsibility_spawnattrs_setdisclaim makes the spawned child disclaim
// TCC "responsible process" status, so macOS checks the parent's responsible
// process (Basecamp.app) instead.
const {
  symbols: { responsibility_spawnattrs_setdisclaim: setDisclaim },
} = Deno.dlopen("/usr/lib/system/libquarantine.dylib", {
  responsibility_spawnattrs_setdisclaim: {
    parameters: ["pointer", "i32"],
    result: "i32",
  },
});

const libc = Deno.dlopen("libSystem.B.dylib", {
  posix_spawn: {
    parameters: [
      "pointer", // pid_t *pid
      "buffer", // const char *path
      "pointer", // posix_spawn_file_actions_t *
      "pointer", // posix_spawnattr_t *
      "pointer", // char *const argv[]
      "pointer", // char *const envp[]
    ],
    result: "i32",
  },
  posix_spawnattr_init: {
    parameters: ["pointer"],
    result: "i32",
  },
  posix_spawnattr_destroy: {
    parameters: ["pointer"],
    result: "i32",
  },
  posix_spawn_file_actions_init: {
    parameters: ["pointer"],
    result: "i32",
  },
  posix_spawn_file_actions_adddup2: {
    parameters: ["pointer", "i32", "i32"], // file_actions, fd, newfd
    result: "i32",
  },
  posix_spawn_file_actions_addclose: {
    parameters: ["pointer", "i32"], // file_actions, fd
    result: "i32",
  },
  posix_spawn_file_actions_addchdir_np: {
    parameters: ["pointer", "buffer"], // file_actions, path
    result: "i32",
  },
  posix_spawn_file_actions_destroy: {
    parameters: ["pointer"],
    result: "i32",
  },
  pipe: {
    parameters: ["pointer"], // int fildes[2]
    result: "i32",
  },
  close: {
    parameters: ["i32"],
    result: "i32",
  },
  waitpid: {
    parameters: ["i32", "pointer", "i32"],
    result: "i32",
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
    pointers[i] = Deno.UnsafePointer.value(Deno.UnsafePointer.of(buffers[i]));
  }
  pointers[buffers.length] = 0n; // NULL terminator
  return { pointer: pointers, buffers };
}

/**
 * Create a pipe and return [readFd, writeFd].
 * @returns {[number, number]}
 */
function createPipe() {
  const fds = new Int32Array(2);
  const result = libc.symbols.pipe(Deno.UnsafePointer.of(fds));
  if (result !== 0) throw new Error("pipe() failed");
  return [fds[0], fds[1]];
}

/**
 * Read all data from a file descriptor until EOF.
 * Opens via /dev/fd/N so reads go through Deno's async I/O (Tokio) and
 * properly yield to the event loop (socket server, timers, etc. stay
 * responsive while a child process runs).
 * @param {number} fd
 * @returns {Promise<string>}
 */
export async function readAll(fd) {
  const file = await Deno.open(`/dev/fd/${fd}`, { read: true });
  libc.symbols.close(fd); // Original fd no longer needed after dup
  return new Response(file.readable).text();
}

/**
 * Spawn a child process using posix_spawn so TCC attributes inherit from
 * the calling process (the responsible binary).
 *
 * Stdout and stderr are captured via pipes. Use `readAll()` on the returned
 * file descriptors, then call `waitForExit()` with the PID.
 *
 * @param {string} executable - Absolute path to the executable
 * @param {string[]} args - Arguments (argv[0] should be the executable name)
 * @param {Record<string, string>} [env] - Environment (defaults to current)
 * @param {string} [cwd] - Working directory for the child process
 * @returns {{ pid: number, stdoutFd: number, stderrFd: number }}
 */
export function spawn(executable, args, env, cwd) {
  const argv = buildStringArray([executable, ...args]);
  const envObj = env ?? Deno.env.toObject();
  const envStrings = Object.entries(envObj)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => `${k}=${v}`);
  const envp = buildStringArray(envStrings);

  // Create pipes for stdout and stderr capture
  const [stdoutRead, stdoutWrite] = createPipe();
  const [stderrRead, stderrWrite] = createPipe();

  // Allocate attr and file_actions on the heap
  const attrBuf = new Uint8Array(512); // posix_spawnattr_t is opaque, 512 is generous
  const fileActionsBuf = new Uint8Array(512);
  const attr = Deno.UnsafePointer.of(attrBuf);
  const fa = Deno.UnsafePointer.of(fileActionsBuf);

  libc.symbols.posix_spawnattr_init(attr);

  // Disclaim TCC responsibility so the child inherits the responsible
  // process from the parent chain (ultimately Basecamp.app).
  setDisclaim(attr, 1);

  libc.symbols.posix_spawn_file_actions_init(fa);

  // Set working directory if specified
  if (cwd) {
    libc.symbols.posix_spawn_file_actions_addchdir_np(fa, cstr(cwd));
  }

  // Redirect child stdout (fd 1) and stderr (fd 2) to pipe write ends
  libc.symbols.posix_spawn_file_actions_adddup2(fa, stdoutWrite, 1);
  libc.symbols.posix_spawn_file_actions_adddup2(fa, stderrWrite, 2);
  // Close the read ends in the child (parent reads from these)
  libc.symbols.posix_spawn_file_actions_addclose(fa, stdoutRead);
  libc.symbols.posix_spawn_file_actions_addclose(fa, stderrRead);

  const pidBuf = new Int32Array(1);

  const result = libc.symbols.posix_spawn(
    Deno.UnsafePointer.of(pidBuf),
    cstr(executable),
    fa,
    attr,
    Deno.UnsafePointer.of(argv.pointer),
    Deno.UnsafePointer.of(envp.pointer),
  );

  // Close write ends in the parent (child owns them now)
  libc.symbols.close(stdoutWrite);
  libc.symbols.close(stderrWrite);

  libc.symbols.posix_spawnattr_destroy(attr);
  libc.symbols.posix_spawn_file_actions_destroy(fa);

  if (result !== 0) {
    libc.symbols.close(stdoutRead);
    libc.symbols.close(stderrRead);
    throw new Error(`posix_spawn failed with error code ${result}`);
  }

  return { pid: pidBuf[0], stdoutFd: stdoutRead, stderrFd: stderrRead };
}

/**
 * Wait for a child process to exit (non-blocking poll).
 * Uses WNOHANG to avoid blocking the Deno event loop.
 * @param {number} pid
 * @param {number} [pollIntervalMs=100] - Polling interval in milliseconds
 * @returns {Promise<number>} Exit status
 */
export async function waitForExit(pid, pollIntervalMs = 100) {
  const status = new Int32Array(1);
  while (true) {
    const result = libc.symbols.waitpid(
      pid,
      Deno.UnsafePointer.of(status),
      WNOHANG,
    );
    if (result > 0) {
      // WEXITSTATUS: (status >> 8) & 0xff
      return (status[0] >> 8) & 0xff;
    }
    // Child not yet exited — yield to event loop
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
