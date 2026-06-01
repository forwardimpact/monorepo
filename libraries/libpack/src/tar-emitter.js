import { collectPaths, resetTimestamps } from "./util.js";

/** Deterministic tarball emitter. */
export class TarEmitter {
  #subprocess;
  #fs;

  /** @param {{runtime?: object}} [opts] */
  constructor({ runtime } = {}) {
    if (!runtime) throw new Error("runtime is required");
    const rt = runtime;
    this.#subprocess = rt.subprocess;
    this.#fs = rt.fs;
  }

  /** Run a command synchronously with binary output; returns stdout Buffer. */
  #exec(cmd, args, opts = {}) {
    const result = this.#subprocess.runSync(cmd, args, {
      encoding: "buffer",
      ...opts,
    });
    return result.stdout;
  }

  /** Emit a deterministic `.tar.gz` from stagedDir to outputPath. */
  async emit(stagedDir, outputPath) {
    await resetTimestamps(stagedDir, this.#fs);
    const files = await collectPaths(stagedDir, this.#fs);
    files.sort();
    const tarBuf = this.#exec("tar", [
      "--no-recursion",
      "-cf",
      "-",
      "-C",
      stagedDir,
      ...files,
    ]);
    const gzBuf = this.#exec("gzip", ["-n"], { input: tarBuf });
    await this.#fs.writeFile(outputPath, gzBuf);
  }
}
