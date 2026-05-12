import { describe, test, expect, afterAll } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, chmod } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync, spawn } from "child_process";
import { existsSync } from "fs";
import { GitEmitter, PackStager } from "@forwardimpact/libpack";

const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")),
);

async function makeTempDir() {
  return mkdtemp(join(tmpdir(), "pathway-serve-"));
}

async function buildMinimalSite() {
  const siteDir = await makeTempDir();

  const stager = new PackStager();
  const emitter = new GitEmitter();

  const fullDir = join(siteDir, "_staging");
  const apmDir = join(siteDir, "_staging-apm");
  await mkdir(fullDir, { recursive: true });
  await mkdir(apmDir, { recursive: true });

  const content = {
    agents: [{ filename: "test-agent.md", content: "# Test Agent\n" }],
    skills: [
      {
        dirname: "test-skill",
        files: [{ path: "SKILL.md", content: "# Test Skill\n" }],
      },
    ],
    teamInstructions: null,
    claudeSettings: {},
    vscodeSettings: {},
  };

  await stager.stageFull(fullDir, content);
  await stager.stageApm(fullDir, apmDir, "test-pack", "1.0.0");

  const repoDir = join(siteDir, "packs", "apm", "test-pack");
  await emitter.emit(apmDir, repoDir, { version: "1.0.0", name: "test-pack" });

  // Add a root index so static serving has something
  await writeFile(join(siteDir, "index.html"), "<html>ok</html>\n");

  return siteDir;
}

describe("fit-pathway serve", () => {
  let siteDir;
  let proc;
  let port;

  afterAll(() => {
    if (proc) proc.kill();
  });

  test("shallow clone works via smart HTTP", async () => {
    siteDir = await buildMinimalSite();
    port = 9100 + Math.floor(Math.random() * 900);
    const cloneDir = join(siteDir, "clone-output");

    // Start the serve command
    const cliPath = join(import.meta.dir, "..", "bin", "fit-pathway.js");
    proc = spawn("bun", [cliPath, "serve", siteDir, `--port=${port}`], {
      env: { ...CLEAN_ENV, PATH: process.env.PATH },
      stdio: "pipe",
    });

    // Wait for server to be ready
    await new Promise((resolve) => {
      proc.stderr.on("data", (d) => {
        if (d.toString().includes("serving at")) resolve();
      });
      setTimeout(resolve, 2000);
    });

    // git clone --depth=1 against the serve command
    const exitCode = await new Promise((resolve, reject) => {
      const git = spawn(
        "git",
        [
          "clone",
          "--depth=1",
          `http://localhost:${port}/packs/apm/test-pack/`,
          cloneDir,
        ],
        { env: { ...CLEAN_ENV, GIT_TERMINAL_PROMPT: "0" } },
      );
      git.on("close", resolve);
      git.on("error", reject);
    });

    expect(exitCode).toBe(0);
    expect(
      existsSync(join(cloneDir, ".claude", "agents", "test-agent.md")),
    ).toBe(true);
    expect(
      existsSync(join(cloneDir, ".claude", "skills", "test-skill", "SKILL.md")),
    ).toBe(true);
  });
});
