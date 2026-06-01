import { describe, test, expect } from "bun:test";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
const runtime = createDefaultRuntime();
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  chmod,
} from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync, spawn } from "child_process";
import { createServer } from "http";
import { existsSync } from "fs";
import { GitEmitter } from "../src/git-emitter.js";

const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);

function git(args, opts = {}) {
  return execFileSync("git", args, { env: CLEAN_ENV, ...opts });
}

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "libpack-git-"));
}

async function createStagedDir() {
  const dir = await makeTempDir();
  await mkdir(join(dir, "sub"), { recursive: true });
  await writeFile(join(dir, "a.txt"), "hello\n");
  await writeFile(join(dir, "sub", "b.txt"), "world\n");
  const execFile = join(dir, "run.sh");
  await writeFile(execFile, "#!/bin/sh\necho ok\n");
  await chmod(execFile, 0o755);
  return dir;
}

async function walkDir(dir, prefix = "") {
  const entries = await readdir(dir, { withFileTypes: true });
  const result = {};
  for (const entry of entries) {
    const rel = prefix ? prefix + "/" + entry.name : entry.name;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      Object.assign(result, await walkDir(full, rel));
    } else {
      result[rel] = await readFile(full);
    }
  }
  return result;
}

describe("GitEmitter", () => {
  test("emits a clonable bare repo", async () => {
    const stagedDir = await createStagedDir();
    const outDir = await makeTempDir();
    const repoPath = join(outDir, "test.git");
    const cloneDir = join(outDir, "clone");

    const emitter = new GitEmitter({ runtime });
    await emitter.emit(stagedDir, repoPath, {
      version: "1.0.0",
      name: "test-pack",
    });

    git(["clone", repoPath, cloneDir]);
    expect(existsSync(join(cloneDir, "a.txt"))).toBe(true);
    expect(existsSync(join(cloneDir, "sub", "b.txt"))).toBe(true);
    expect(existsSync(join(cloneDir, "run.sh"))).toBe(true);

    const content = await readFile(join(cloneDir, "a.txt"), "utf-8");
    expect(content).toBe("hello\n");
  });

  test("version tag is present", async () => {
    const stagedDir = await createStagedDir();
    const outDir = await makeTempDir();
    const repoPath = join(outDir, "test.git");

    const emitter = new GitEmitter({ runtime });
    await emitter.emit(stagedDir, repoPath, {
      version: "2.5.0",
      name: "tagged",
    });

    const tags = git(["ls-remote", "--tags", repoPath]).toString();
    expect(tags).toContain("refs/tags/v2.5.0");
  });

  test("only design-specified files exist", async () => {
    const stagedDir = await createStagedDir();
    const outDir = await makeTempDir();
    const repoPath = join(outDir, "test.git");

    const emitter = new GitEmitter({ runtime });
    await emitter.emit(stagedDir, repoPath, {
      version: "1.0.0",
      name: "clean",
    });

    expect(existsSync(join(repoPath, "hooks"))).toBe(false);
    expect(existsSync(join(repoPath, "HEAD"))).toBe(true);
    expect(existsSync(join(repoPath, "config"))).toBe(true);
    expect(existsSync(join(repoPath, "description"))).toBe(true);
    expect(existsSync(join(repoPath, "info", "refs"))).toBe(true);
    expect(existsSync(join(repoPath, "objects", "info", "packs"))).toBe(true);
    expect(existsSync(join(repoPath, "packed-refs"))).toBe(true);

    const desc = await readFile(join(repoPath, "description"), "utf-8");
    expect(desc).toBe("Pathway pack: clean\n");
  });

  test("two calls produce byte-identical output", async () => {
    const stagedDir = await createStagedDir();
    const outDir = await makeTempDir();
    const repo1 = join(outDir, "a.git");
    const repo2 = join(outDir, "b.git");

    const emitter = new GitEmitter({ runtime });
    await emitter.emit(stagedDir, repo1, { version: "1.0.0", name: "det" });
    await emitter.emit(stagedDir, repo2, { version: "1.0.0", name: "det" });

    const files1 = await walkDir(repo1);
    const files2 = await walkDir(repo2);

    const keys1 = Object.keys(files1).sort();
    const keys2 = Object.keys(files2).sort();
    expect(keys1).toEqual(keys2);

    for (const key of keys1) {
      expect(Buffer.compare(files1[key], files2[key])).toBe(0);
    }
  });

  test("clones over dumb HTTP", async () => {
    const stagedDir = await createStagedDir();
    const outDir = await makeTempDir();
    const repoPath = join(outDir, "test.git");
    const cloneDir = join(outDir, "http-clone");

    const emitter = new GitEmitter({ runtime });
    await emitter.emit(stagedDir, repoPath, {
      version: "1.0.0",
      name: "http-test",
    });

    const server = createServer(async (req, res) => {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const filePath = join(repoPath, pathname);
      try {
        const data = await readFile(filePath);
        res.writeHead(200);
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      // Use spawn (async) so the HTTP server can handle requests
      const exitCode = await new Promise((resolve, reject) => {
        const proc = spawn(
          "git",
          ["clone", `http://localhost:${port}/`, cloneDir],
          { env: { ...CLEAN_ENV, GIT_TERMINAL_PROMPT: "0" } },
        );
        proc.on("close", resolve);
        proc.on("error", reject);
      });
      expect(exitCode).toBe(0);
      expect(existsSync(join(cloneDir, "a.txt"))).toBe(true);
      expect(existsSync(join(cloneDir, "sub", "b.txt"))).toBe(true);
    } finally {
      server.close();
    }
  });

  test("shallow clones over smart HTTP", async () => {
    const stagedDir = await createStagedDir();
    const outDir = await makeTempDir();
    const repoPath = join(outDir, "test.git");
    const cloneDir = join(outDir, "shallow-clone");

    const emitter = new GitEmitter({ runtime });
    await emitter.emit(stagedDir, repoPath, {
      version: "1.0.0",
      name: "smart-http-test",
    });

    const server = createServer(async (req, res) => {
      const url = new URL(req.url, "http://localhost");

      // Smart HTTP ref advertisement
      if (
        url.pathname === "/info/refs" &&
        url.searchParams.get("service") === "git-upload-pack"
      ) {
        const data = await readFile(join(repoPath, "smart-http", "info-refs"));
        res.writeHead(200, {
          "Content-Type": "application/x-git-upload-pack-advertisement",
        });
        res.end(data);
        return;
      }

      // Smart HTTP upload-pack — route by POST body content
      if (url.pathname === "/git-upload-pack" && req.method === "POST") {
        const bodyChunks = [];
        req.on("data", (c) => bodyChunks.push(c));
        req.on("end", async () => {
          const body = Buffer.concat(bodyChunks).toString("utf-8");
          const file = body.includes("done")
            ? "upload-pack-result"
            : "upload-pack-shallow";
          const data = await readFile(join(repoPath, "smart-http", file));
          res.writeHead(200, {
            "Content-Type": "application/x-git-upload-pack-result",
          });
          res.end(data);
        });
        return;
      }

      // Dumb HTTP fallback
      const filePath = join(repoPath, url.pathname);
      try {
        const data = await readFile(filePath);
        res.writeHead(200);
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const exitCode = await new Promise((resolve, reject) => {
        const proc = spawn(
          "git",
          ["clone", "--depth=1", `http://localhost:${port}/`, cloneDir],
          { env: { ...CLEAN_ENV, GIT_TERMINAL_PROMPT: "0" } },
        );
        proc.on("close", resolve);
        proc.on("error", reject);
      });
      expect(exitCode).toBe(0);
      expect(existsSync(join(cloneDir, "a.txt"))).toBe(true);
      expect(existsSync(join(cloneDir, "sub", "b.txt"))).toBe(true);
      expect(existsSync(join(cloneDir, "run.sh"))).toBe(true);
    } finally {
      server.close();
    }
  });
});
