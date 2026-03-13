import { mock } from "node:test";

/**
 * Creates a mock filesystem backed by an in-memory Map
 * @param {Object<string, string>} files - Initial file contents keyed by path
 * @returns {object} Mock fs with readFile, writeFile, readdir, stat, mkdir, access, copyFile
 */
export function createMockFs(files = {}) {
  const data = new Map(Object.entries(files));
  const dirs = new Set();

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
    readFile: mock.fn(async (path, encoding) => {
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
    writeFile: mock.fn(async (path, content) => {
      data.set(
        path,
        typeof content === "string" ? content : content.toString(),
      );
    }),
    readdir: mock.fn(async (path) => {
      const entries = [];
      const prefix = path.endsWith("/") ? path : `${path}/`;
      for (const key of data.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const name = rest.split("/")[0];
          if (name && !entries.includes(name)) {
            entries.push(name);
          }
        }
      }
      return entries;
    }),
    stat: mock.fn(async (path) => {
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
    mkdir: mock.fn(async (path) => {
      dirs.add(path);
    }),
    access: mock.fn(async (path) => {
      if (!data.has(path) && !dirs.has(path)) {
        const err = new Error(
          `ENOENT: no such file or directory, access '${path}'`,
        );
        err.code = "ENOENT";
        throw err;
      }
    }),
    copyFile: mock.fn(async (src, dest) => {
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
    existsSync: mock.fn((path) => data.has(path) || dirs.has(path)),
    readFileSync: mock.fn((path, encoding) => {
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
    writeFileSync: mock.fn((path, content) => {
      data.set(
        path,
        typeof content === "string" ? content : content.toString(),
      );
    }),
    mkdirSync: mock.fn((path) => {
      dirs.add(path);
    }),
  };
}
