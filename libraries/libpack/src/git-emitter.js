import { join } from "path";

const AUTHOR = "Forward Impact Pathway";
const EMAIL = "pathway@forwardimpact.team";
const EPOCH = "1970-01-01T00:00:00Z";

const BARE_CONFIG = `[core]
\trepositoryformatversion = 0
\tfilemode = true
\tbare = true
`;

const SMART_HTTP_CAPS =
  "shallow ofs-delta symref=HEAD:refs/heads/main agent=libpack/static";

function pktLine(data) {
  const len = Buffer.byteLength(data, "utf-8") + 4;
  return len.toString(16).padStart(4, "0") + data;
}

/** Static bare git repo emitter for dumb-HTTP serving. */
export class GitEmitter {
  #subprocess;
  #fs;
  #proc;

  /** @param {{runtime?: object}} [opts] */
  constructor({ runtime } = {}) {
    if (!runtime) throw new Error("runtime is required");
    const rt = runtime;
    this.#subprocess = rt.subprocess;
    this.#fs = rt.fs;
    this.#proc = rt.proc;
  }

  /** Run a git command synchronously; returns stdout as string. */
  #exec(cmd, args, opts = {}) {
    const result = this.#subprocess.runSync(cmd, args, opts);
    return result.stdout;
  }

  /** Emit a static bare git repo from stagedDir at outputPath. */
  async emit(stagedDir, outputPath, { version, name }) {
    const { mkdir, writeFile, rm, readdir } = this.#fs;
    const cleanEnv = Object.fromEntries(
      Object.entries(this.#proc.env).filter(([k]) => !k.startsWith("GIT_")),
    );
    const gitEnv = {
      ...cleanEnv,
      GIT_DIR: outputPath,
      GIT_AUTHOR_NAME: AUTHOR,
      GIT_AUTHOR_EMAIL: EMAIL,
      GIT_AUTHOR_DATE: EPOCH,
      GIT_COMMITTER_NAME: AUTHOR,
      GIT_COMMITTER_EMAIL: EMAIL,
      GIT_COMMITTER_DATE: EPOCH,
    };

    // 1. Scaffold bare repo
    this.#exec("git", ["init", "--bare", "--initial-branch=main", outputPath], {
      env: cleanEnv,
    });

    // 2–4. Hash all objects and build trees
    const rootTree = await this.#hashTree(stagedDir, gitEnv);

    // 5. Create commit
    const commitSha = this.#exec(
      "git",
      ["commit-tree", rootTree, "-m", `pathway v${version}`],
      { env: gitEnv },
    ).trim();

    // 6. Point default branch at commit
    this.#exec("git", ["update-ref", "refs/heads/main", commitSha], {
      env: gitEnv,
    });

    // 7. Lightweight tag
    this.#exec("git", ["update-ref", `refs/tags/v${version}`, commitSha], {
      env: gitEnv,
    });

    // 8. Single deterministic packfile
    // -f passes --no-reuse-delta to git-pack-objects
    this.#exec("git", ["repack", "-a", "-d", "-f"], {
      env: gitEnv,
    });

    // 9. Remove loose objects
    this.#exec("git", ["prune-packed"], { env: gitEnv });

    // 10. Write info/refs + objects/info/packs
    this.#exec("git", ["update-server-info"], { env: gitEnv });

    // 11. Write packed-refs
    this.#exec("git", ["pack-refs", "--all"], { env: gitEnv });

    // 12. Deterministic config
    await writeFile(join(outputPath, "config"), BARE_CONFIG);

    // 13. Description
    await writeFile(join(outputPath, "description"), `Pathway pack: ${name}\n`);

    // 14. Strip to design-specified files + empty refs skeleton
    await rm(join(outputPath, "hooks"), { recursive: true, force: true });
    await rm(join(outputPath, "info", "exclude"), { force: true });
    // Keep refs/ as empty dirs — local git clone reads them directly
    const refsDir = join(outputPath, "refs");
    await rm(refsDir, { recursive: true, force: true });
    await mkdir(join(refsDir, "heads"), { recursive: true });
    await mkdir(join(refsDir, "tags"), { recursive: true });
    // Remove loose objects (all packed now)
    const objectsDir = join(outputPath, "objects");
    const objectEntries = await readdir(objectsDir);
    for (const entry of objectEntries) {
      if (entry !== "info" && entry !== "pack") {
        await rm(join(objectsDir, entry), { recursive: true, force: true });
      }
    }

    // 15. Pre-computed smart HTTP responses for shallow clone support.
    // Dumb HTTP cannot negotiate shallow capabilities, so tools that
    // use `git clone --depth=1` (e.g. APM) need the smart HTTP
    // protocol. For a single-commit repo the responses are static.
    await this.#emitSmartHttp(outputPath, commitSha, version);
  }

  async #hashTree(stagedDir, gitEnv) {
    const { readdir, readFile, stat } = this.#fs;
    const entries = await readdir(stagedDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    const lines = [];
    for (const entry of entries) {
      const fullPath = join(stagedDir, entry.name);
      if (entry.isDirectory()) {
        const treeSha = await this.#hashTree(fullPath, gitEnv);
        lines.push(`040000 tree ${treeSha}\t${entry.name}`);
      } else {
        const blobSha = this.#exec("git", ["hash-object", "-w", "--stdin"], {
          input: await readFile(fullPath),
          env: gitEnv,
        }).trim();
        const mode = (await stat(fullPath)).mode & 0o111 ? "100755" : "100644";
        lines.push(`${mode} blob ${blobSha}\t${entry.name}`);
      }
    }
    return this.#exec("git", ["mktree"], {
      input: lines.join("\n") + "\n",
      env: gitEnv,
    }).trim();
  }

  async #emitSmartHttp(outputPath, commitSha, version) {
    const { mkdir, writeFile, readdir, readFile } = this.#fs;
    const smartDir = join(outputPath, "smart-http");
    await mkdir(smartDir, { recursive: true });

    // v1 ref advertisement — pkt-line format with shallow capability
    const adv =
      pktLine("# service=git-upload-pack\n") +
      "0000" +
      pktLine(`${commitSha} HEAD\0${SMART_HTTP_CAPS}\n`) +
      pktLine(`${commitSha} refs/heads/main\n`) +
      pktLine(`${commitSha} refs/tags/v${version}\n`) +
      "0000";
    await writeFile(join(smartDir, "info-refs"), adv, "utf-8");

    // Pre-computed upload-pack responses for shallow clone.
    // v1 stateless-rpc shallow fetch issues two POSTs to /git-upload-pack:
    //   POST 1 (no "done") → server returns shallow list + flush
    //   POST 2 (has "done") → server returns shallow list + flush + NAK + pack
    // The web server routes by checking whether the POST body contains "done".
    const packDir = join(outputPath, "objects", "pack");
    const packFile = (await readdir(packDir)).find((f) => f.endsWith(".pack"));
    const packData = await readFile(join(packDir, packFile));

    const shallowFlush = pktLine(`shallow ${commitSha}\n`) + "0000";

    await writeFile(
      join(smartDir, "upload-pack-shallow"),
      shallowFlush,
      "utf-8",
    );

    const resultHeader = shallowFlush + pktLine("NAK\n");
    await writeFile(
      join(smartDir, "upload-pack-result"),
      Buffer.concat([Buffer.from(resultHeader, "ascii"), packData]),
    );
  }
}
