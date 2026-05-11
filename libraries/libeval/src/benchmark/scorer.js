/**
 * Scorer (spec 870 plan-a Step 5).
 *
 * Spawns `<template>/scoring/run.sh` from the family-shipped template path
 * (NEVER copied to the agent CWD — design Decision 3). Per-test diagnostic
 * rows arrive via fd 3 as NDJSON (`{ test, pass, message? }`). Exit code
 * is authoritative for the verdict — fd-3 NDJSON cannot override it
 * (design Decision 12).
 *
 * POSIX-only in v1. Windows support is deferred.
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createWriteStream } from "node:fs";
import { join } from "node:path";

const SCORING_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * @typedef {{ cwd: string, port: number, runDir: string }} ScorerCtx
 *
 * @typedef {{ verdict: "pass" | "fail", details: object[], exitCode: number }} ScoringOutcome
 */

/**
 * Invoke a task's scoring script and return the verdict.
 *
 * @param {import("./task-family.js").Task} task
 * @param {ScorerCtx} ctx
 * @returns {Promise<ScoringOutcome>}
 */
export async function runScoring(task, ctx) {
  const scriptPath = join(task.paths.scoring, "run.sh");
  return new Promise((resolveP) => {
    const stderrStream = createWriteStream(
      join(ctx.runDir, "scoring.stderr.log"),
    );
    let child;
    try {
      child = spawn(scriptPath, [], {
        env: {
          ...process.env,
          WORKDIR: ctx.cwd,
          PORT: String(ctx.port),
          RESULTS_FD: "3",
        },
        stdio: ["inherit", "pipe", "pipe", "pipe"],
      });
    } catch (err) {
      stderrStream.end(`failed to spawn: ${err.message}\n`);
      resolveP({
        verdict: "fail",
        details: [],
        exitCode: -1,
      });
      return;
    }

    const details = [];
    const fd3 = child.stdio[3];
    let fd3Closed = !fd3;
    let exited = false;
    let exitCode = -1;

    const maybeResolve = () => {
      if (!fd3Closed || !exited) return;
      resolveP({
        verdict: exitCode === 0 ? "pass" : "fail",
        details,
        exitCode,
      });
    };

    if (fd3) {
      const rl = createInterface({ input: fd3, crlfDelay: Infinity });
      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          details.push(JSON.parse(trimmed));
        } catch {
          details.push({ raw: trimmed, parseError: true });
        }
      });
      rl.on("close", () => {
        fd3Closed = true;
        maybeResolve();
      });
    }
    child.stdout?.on("data", () => {
      // Drained but not captured — stdout is diagnostic only.
    });
    child.stderr?.pipe(stderrStream);

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already gone.
      }
    }, SCORING_TIMEOUT_MS);

    child.on("close", (code) => {
      clearTimeout(timer);
      stderrStream.end();
      exitCode = code ?? -1;
      exited = true;
      maybeResolve();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      stderrStream.end(`spawn error: ${err.message}\n`);
      exitCode = -1;
      exited = true;
      fd3Closed = true;
      maybeResolve();
    });
  });
}
