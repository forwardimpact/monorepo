import { readFileSync, writeFileSync, existsSync } from "node:fs";
import fsAsync from "node:fs/promises";
import path from "node:path";
import { Finder } from "@forwardimpact/libutil";
import {
  appendClaim,
  removeClaim,
  parseClaims,
  filterExpired,
} from "../active-claims.js";

function projectRoot() {
  const logger = { debug() {} };
  const finder = new Finder(fsAsync, logger, process);
  return finder.findProjectRoot(process.cwd());
}

function memoryPath(values) {
  const root = projectRoot();
  const wikiRoot = values["wiki-root"] || path.join(root, "wiki");
  return path.join(wikiRoot, "MEMORY.md");
}

function readMemory(memPath) {
  if (!existsSync(memPath)) return "";
  return readFileSync(memPath, "utf-8");
}

function addDays(today, n) {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Insert a row into MEMORY.md `## Active Claims`. Refuses if (agent, target) already present. */
export function runClaimCommand(values, _args, cli) {
  const agent = values.agent || process.env.LIBEVAL_AGENT_PROFILE;
  if (!agent) {
    cli.usageError("claim requires --agent or LIBEVAL_AGENT_PROFILE");
    process.exit(2);
  }
  if (!values.target || !values.branch) {
    cli.usageError("claim requires --target and --branch");
    process.exit(2);
  }
  const today = values.today || new Date().toISOString().slice(0, 10);
  const expires = values["expires-at"] || addDays(today, 7);
  const memPath = memoryPath(values);
  const text = readMemory(memPath);
  const result = appendClaim(text, {
    agent,
    target: values.target,
    branch: values.branch,
    pr: values.pr || null,
    claimed_at: today,
    expires_at: expires,
  });
  if (!result.inserted) {
    process.stderr.write(
      `claim already exists for ${agent}/${values.target}\n`,
    );
    process.exit(2);
  }
  writeFileSync(memPath, result.text);
  process.stdout.write(`claimed ${values.target} (expires ${expires})\n`);
}

/** Remove a claim row. `--expired` cleans every row past expires_at. */
export function runReleaseCommand(values, _args, cli) {
  const memPath = memoryPath(values);
  const text = readMemory(memPath);

  if (values.expired) {
    const today = values.today || new Date().toISOString().slice(0, 10);
    const claims = parseClaims(text);
    const { expired } = filterExpired(claims, today);
    let current = text;
    let count = 0;
    for (const c of expired) {
      const result = removeClaim(current, { agent: c.agent, target: c.target });
      if (result.removed) {
        current = result.text;
        count++;
      }
    }
    writeFileSync(memPath, current);
    process.stdout.write(`released ${count} expired claim(s)\n`);
    return;
  }

  const agent = values.agent || process.env.LIBEVAL_AGENT_PROFILE;
  if (!agent) {
    cli.usageError("release requires --agent or --expired");
    process.exit(2);
  }
  if (!values.target) {
    cli.usageError("release requires --target (or --expired)");
    process.exit(2);
  }
  const result = removeClaim(text, { agent, target: values.target });
  writeFileSync(memPath, result.text);
  if (!result.removed) {
    process.stdout.write(`no matching claim for ${agent}/${values.target}\n`);
  } else {
    process.stdout.write(`released ${values.target}\n`);
  }
}
