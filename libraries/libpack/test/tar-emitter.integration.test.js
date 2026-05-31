import { describe, test, expect } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import { TarEmitter } from "../src/tar-emitter.js";

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "libpack-tar-"));
}

async function createStagedDir() {
  const dir = await makeTempDir();
  await mkdir(join(dir, "sub"), { recursive: true });
  await writeFile(join(dir, "a.txt"), "hello\n");
  await writeFile(join(dir, "sub", "b.txt"), "world\n");
  return dir;
}

describe("TarEmitter", () => {
  test("emits a valid tarball", async () => {
    const stagedDir = await createStagedDir();
    const outDir = await makeTempDir();
    const outputPath = join(outDir, "test.tar.gz");

    const emitter = new TarEmitter();
    await emitter.emit(stagedDir, outputPath);

    const listing = execFileSync("tar", ["tzf", outputPath]).toString();
    expect(listing).toContain("./a.txt");
    expect(listing).toContain("./sub/b.txt");
  });

  test("two calls produce byte-identical output", async () => {
    const stagedDir = await createStagedDir();
    const outDir = await makeTempDir();
    const path1 = join(outDir, "a.tar.gz");
    const path2 = join(outDir, "b.tar.gz");

    const emitter = new TarEmitter();
    await emitter.emit(stagedDir, path1);
    await emitter.emit(stagedDir, path2);

    const buf1 = await readFile(path1);
    const buf2 = await readFile(path2);
    expect(Buffer.compare(buf1, buf2)).toBe(0);
  });
});
