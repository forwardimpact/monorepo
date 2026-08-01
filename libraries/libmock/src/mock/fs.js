import { Readable, Writable } from "node:stream";
import { spy } from "./spy.js";
/**
 * Creates a mock filesystem over an in-memory Map
 * @param {Object<string, string>} files - Initial file contents keyed by path
 * @returns {object} Mock fs with readFile, writeFile, readdir, stat, mkdir, access, copyFile
 */
export function createMockFs(files = {}) {
  const data = new Map(Object.entries(files));
  const dirs = new Set();
  let nextFd = 3;
  const openFds = new Map();

  // Auto-create parent directories for initial files
  for (const path of data.keys()) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }

  return {
    data,
    dirs,
    readFile: spy(async (path, encoding) => {
      const content = data.get(path);
      if (content === undefined) {
        const err = new Error(
          `ENOENT: no such file or directory, open '${path}'`,
        );
        err.code = "ENOENT";
        throw err;
      }
      return encoding ? content : Buffer.from(content);
    }),
    writeFile: spy(async (path, content) => {
      data.set(
        path,
        typeof content === "string" ? content : content.toString(),
      );
    }),
    appendFile: spy(async (path, content) => {
      const chunk = typeof content === "string" ? content : content.toString();
      data.set(path, (data.get(path) ?? "") + chunk);
    }),
    rename: spy(async (src, dest) => {
      if (!data.has(src)) {
        const err = new Error(
          `ENOENT: no such file or directory, rename '${src}' -> '${dest}'`,
        );
        err.code = "ENOENT";
        throw err;
      }
      data.set(dest, data.get(src));
      data.delete(src);
    }),
    readdir: spy(async (path, opts = {}) => {
      // Collect immediate children. An entry is a directory if anything lives
      // below it (a deeper key), or if mkdir/cp registered it.
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const isDir = new Map();
      for (const key of [...data.keys(), ...dirs]) {
        if (!key.startsWith(prefix)) continue;
        const rest = key.slice(prefix.length);
        const name = rest.split("/")[0];
        if (!name) continue;
        const dir = rest.includes("/") || dirs.has(`${prefix}${name}`);
        isDir.set(name, isDir.get(name) || dir);
      }
      const names = [...isDir.keys()];
      if (!opts.withFileTypes) return names;
      // Mirror node:fs Dirent: name + isDirectory()/isFile()/isSymbolicLink().
      return names.map((name) => ({
        name,
        isDirectory: () => isDir.get(name),
        isFile: () => !isDir.get(name),
        isSymbolicLink: () => false,
      }));
    }),
    stat: spy(async (path) => {
      if (data.has(path)) {
        return { isFile: () => true, isDirectory: () => false };
      }
      if (dirs.has(path)) {
        return { isFile: () => false, isDirectory: () => true };
      }
      const err = new Error(
        `ENOENT: no such file or directory, stat '${path}'`,
      );
      err.code = "ENOENT";
      throw err;
    }),
    mkdir: spy(async (path) => {
      dirs.add(path);
    }),
    mkdtemp: spy(async (prefix) => {
      // Mirror node:fs/promises.mkdtemp: append 6 random chars to the prefix
      // and register the directory. Then return the created path.
      const path = `${prefix}${Math.random().toString(36).slice(2, 8)}`;
      dirs.add(path);
      return path;
    }),
    rm: spy(async (path, opts = {}) => {
      // Mirror fs.rm(path, { recursive }): with `recursive`, drop the entry
      // and every descendant so subsequent readdir/access don't see ghosts.
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const matches = (k) =>
        k === path || (opts.recursive && k.startsWith(prefix));
      for (const k of [...data.keys()]) if (matches(k)) data.delete(k);
      for (const k of [...dirs]) if (matches(k)) dirs.delete(k);
    }),
    lstat: spy(async (path) => {
      if (data.has(path)) {
        return {
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
        };
      }
      if (dirs.has(path)) {
        return {
          isFile: () => false,
          isDirectory: () => true,
          isSymbolicLink: () => false,
        };
      }
      const err = new Error(
        `ENOENT: no such file or directory, lstat '${path}'`,
      );
      err.code = "ENOENT";
      throw err;
    }),
    unlink: spy(async (path) => {
      data.delete(path);
    }),
    symlink: spy(async (_target, path) => {
      dirs.add(path);
    }),
    access: spy(async (path) => {
      if (!data.has(path) && !dirs.has(path)) {
        const err = new Error(
          `ENOENT: no such file or directory, access '${path}'`,
        );
        err.code = "ENOENT";
        throw err;
      }
    }),
    copyFile: spy(async (src, dest) => {
      const content = data.get(src);
      if (content === undefined) {
        const err = new Error(
          `ENOENT: no such file or directory, copyFile '${src}'`,
        );
        err.code = "ENOENT";
        throw err;
      }
      data.set(dest, content);
    }),
    cp: spy(async (src, dest) => {
      // Mirror fs.cp(src, dest, { recursive }): copy a file, or a directory
      // subtree (every entry under `src/` re-rooted under `dest/`).
      if (data.has(src)) {
        data.set(dest, data.get(src));
        return;
      }
      const prefix = src.endsWith("/") ? src : `${src}/`;
      const destPrefix = dest.endsWith("/") ? dest : `${dest}/`;
      const reroot = (k) => destPrefix + k.slice(prefix.length);
      const under = (k) => k.startsWith(prefix);
      dirs.add(dest);
      for (const key of [...data.keys()].filter(under)) {
        data.set(reroot(key), data.get(key));
      }
      for (const dir of [...dirs].filter(under)) dirs.add(reroot(dir));
    }),
    // The in-memory store does not model timestamps or permissions. These
    // record the call (with spy) so consumers stay testable and assertable.
    utimes: spy(async () => {}),
    chmod: spy(async () => {}),
    existsSync: spy((path) => data.has(path) || dirs.has(path)),
    readFileSync: spy((path, encoding) => {
      const content = data.get(path);
      if (content === undefined) {
        const err = new Error(
          `ENOENT: no such file or directory, open '${path}'`,
        );
        err.code = "ENOENT";
        throw err;
      }
      return encoding ? content : Buffer.from(content);
    }),
    writeFileSync: spy((path, content) => {
      data.set(
        path,
        typeof content === "string" ? content : content.toString(),
      );
    }),
    mkdirSync: spy((path) => {
      dirs.add(path);
    }),
    statSync: spy((path) => {
      const content = data.get(path);
      if (content !== undefined)
        return {
          size: Buffer.byteLength(content),
          mtimeMs: 0,
          isFile: () => true,
          isDirectory: () => false,
        };
      if (dirs.has(path))
        return {
          size: 0,
          mtimeMs: 0,
          isFile: () => false,
          isDirectory: () => true,
        };
      const err = new Error(
        `ENOENT: no such file or directory, stat '${path}'`,
      );
      err.code = "ENOENT";
      throw err;
    }),
    readdirSync: spy((dir) => {
      const prefix = dir.endsWith("/") ? dir : `${dir}/`;
      const names = new Set();
      for (const key of [...data.keys(), ...dirs]) {
        if (!key.startsWith(prefix)) continue;
        const name = key.slice(prefix.length).split("/")[0];
        if (name) names.add(name);
      }
      return [...names];
    }),
    // The in-memory store does not model permissions. Record the call.
    chmodSync: spy(() => {}),
    openSync: spy((path, flags = "r") => {
      // For write/append flags, create/truncate. For read flags, require the
      // file to exist (mirror node:fs.openSync ENOENT). Hand back a synthetic
      // descriptor that records the path it opens.
      const reading = typeof flags === "string" && flags.startsWith("r");
      if (reading && !data.has(path)) {
        const err = new Error(
          `ENOENT: no such file or directory, open '${path}'`,
        );
        err.code = "ENOENT";
        throw err;
      }
      if (!reading) data.set(path, "");
      const fd = nextFd++;
      openFds.set(fd, path);
      return fd;
    }),
    readSync: spy((fd, buffer, offset = 0, length, position = 0) => {
      // Mirror fs.readSync(fd, buffer, offset, length, position): copy bytes
      // from the file's stored content into `buffer`. Return the byte count.
      const path = openFds.get(fd);
      if (path === undefined) {
        const err = new Error("EBADF: bad file descriptor, read");
        err.code = "EBADF";
        throw err;
      }
      const content = Buffer.from(data.get(path) ?? "");
      const start = position ?? 0;
      const want = length ?? buffer.length - offset;
      const slice = content.subarray(start, start + want);
      slice.copy(buffer, offset);
      return slice.length;
    }),
    closeSync: spy((fd) => {
      openFds.delete(fd);
    }),
    unlinkSync: spy((path) => {
      data.delete(path);
    }),
    createReadStream: spy((path) => {
      // Stream the stored content (or error asynchronously, like node:fs).
      const content = data.get(path);
      if (content === undefined) {
        const err = new Error(
          `ENOENT: no such file or directory, open '${path}'`,
        );
        err.code = "ENOENT";
        const stream = new Readable({ read() {} });
        queueMicrotask(() => stream.emit("error", err));
        return stream;
      }
      return Readable.from([Buffer.from(content)]);
    }),
    createWriteStream: spy((path, opts = {}) => {
      // Accumulate writes into the in-memory store. `flags: "a"` appends.
      const append = opts.flags === "a";
      if (!append || !data.has(path)) data.set(path, "");
      const stream = new Writable({
        write(chunk, _enc, cb) {
          data.set(path, (data.get(path) ?? "") + chunk.toString());
          cb();
        },
      });
      return stream;
    }),
  };
}
