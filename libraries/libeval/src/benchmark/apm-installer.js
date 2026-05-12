/**
 * ApmInstaller — runs `apm install --target claude` in the family root to
 * materialise skills and agents, copies the resulting `.claude/` into a
 * staging directory, and computes the manifest fingerprint from the lockfile.
 * Per-task copy happens later in WorkdirManager.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * @param {import("./task-family.js").TaskFamily} family
 * @param {string} outputDir - The benchmark run's output directory.
 * @returns {Promise<{stagingDir: string, skillSetHash: string}>}
 */
export async function installApm(family, outputDir) {
  const stagingDir = join(outputDir, ".apm-staging");
  const stagedClaude = join(stagingDir, ".claude");
  const sourceClaude = join(family.rootPath, ".claude");

  await runApmInstall(family.rootPath);

  try {
    await access(sourceClaude);
  } catch {
    throw new Error(
      `apm install did not produce .claude/ at ${sourceClaude}; check the family's apm.yml`,
    );
  }

  await rm(stagingDir, { recursive: true, force: true });
  await cp(sourceClaude, stagedClaude, { recursive: true });

  // Stage the family-local judge profile outside .claude/ so it is available
  // to the judge but never copied into the agent-under-test's CWD.
  const judgeSource = join(family.rootPath, "judge.md");
  const judgeProfilesDir = join(stagingDir, "judge-profiles");
  try {
    await access(judgeSource);
    await mkdir(judgeProfilesDir, { recursive: true });
    await cp(judgeSource, join(judgeProfilesDir, "judge.md"));
  } catch {}

  const lockPath = join(family.rootPath, "apm.lock.yaml");
  const lockBytes = await readFile(lockPath).catch(() => {
    throw new Error(
      `apm install did not produce apm.lock.yaml at ${lockPath}`,
    );
  });
  const skillSetHash =
    "sha256:" + createHash("sha256").update(normalizeLf(lockBytes)).digest("hex");

  return { stagingDir, skillSetHash, judgeProfilesDir };
}

function normalizeLf(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d && i + 1 < buf.length && buf[i + 1] === 0x0a) continue;
    out.push(buf[i]);
  }
  return Buffer.from(out);
}

function runApmInstall(cwd) {
  return new Promise((res, rej) => {
    const child = spawn("apm", ["install", "--target", "claude"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stdout.on("data", () => {});
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (e) => {
      rej(new Error(`failed to spawn apm: ${e.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) res();
      else rej(new Error(`apm install exited ${code}: ${stderr}`));
    });
  });
}
