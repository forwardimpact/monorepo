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
import { createDefaultIo } from "../io.js";
import { buildRepo } from "../build-repo.js";

function projectRoot(io) {
  const logger = { debug() {} };
  const finder = new Finder(fsAsync, logger, { cwd: io.cwd });
  return finder.findProjectRoot(io.cwd());
}

function memoryPath(values, io) {
  const root = projectRoot(io);
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

async function pushWiki(repoFactory, values, io, message) {
  if (!repoFactory) return;
  try {
    const repo = await repoFactory(values, io.cwd());
    repo.inheritIdentity();
    const result = repo.commitAndPush(message);
    if (result.pushed) io.stdout("push: committed and pushed\n");
  } catch (err) {
    io.stderr(`push failed (saved locally): ${err.message}\n`);
  }
}

/** Insert a row into MEMORY.md `## Active Claims`. Refuses if (agent, target) already present. */
export async function runClaimCommand(
  values,
  _args,
  cli,
  io = createDefaultIo(),
  repoFactory = buildRepo,
) {
  const agent = values.agent || io.env.LIBEVAL_AGENT_PROFILE;
  if (!agent) {
    cli.usageError("claim requires --agent or LIBEVAL_AGENT_PROFILE");
    return io.exit(2);
  }
  if (!values.target || !values.branch) {
    cli.usageError("claim requires --target and --branch");
    return io.exit(2);
  }
  const today = values.today || io.today();
  const expires = values["expires-at"] || addDays(today, 7);
  const memPath = memoryPath(values, io);
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
    io.stderr(`claim already exists for ${agent}/${values.target}\n`);
    return io.exit(2);
  }
  writeFileSync(memPath, result.text);
  io.stdout(`claimed ${values.target} (expires ${expires})\n`);
  await pushWiki(repoFactory, values, io, `wiki: claim ${values.target}`);
}

/** Remove a claim row. `--expired` cleans every row past expires_at. */
export async function runReleaseCommand(
  values,
  _args,
  cli,
  io = createDefaultIo(),
  repoFactory = buildRepo,
) {
  const memPath = memoryPath(values, io);
  const text = readMemory(memPath);

  if (values.expired) {
    const today = values.today || io.today();
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
    io.stdout(`released ${count} expired claim(s)\n`);
    await pushWiki(repoFactory, values, io, "wiki: release expired claims");
    return;
  }

  const agent = values.agent || io.env.LIBEVAL_AGENT_PROFILE;
  if (!agent) {
    cli.usageError("release requires --agent or --expired");
    return io.exit(2);
  }
  if (!values.target) {
    cli.usageError("release requires --target (or --expired)");
    return io.exit(2);
  }
  const result = removeClaim(text, { agent, target: values.target });
  writeFileSync(memPath, result.text);
  if (!result.removed) {
    io.stdout(`no matching claim for ${agent}/${values.target}\n`);
  } else {
    io.stdout(`released ${values.target}\n`);
    await pushWiki(repoFactory, values, io, `wiki: release ${values.target}`);
  }
}
