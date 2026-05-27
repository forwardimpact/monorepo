import { spy } from "./spy.js";
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
    readdir: spy(async (path) => {
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
  };
}
