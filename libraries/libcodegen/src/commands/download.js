import { createScriptConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createBundleDownloader } from "@forwardimpact/libutil";

/**
 * Exec a trailing `-- <command>` after the download, forwarding stdio and
 * termination signals, then exit with the child's status. Returns without
 * spawning when no `-- <command>` follows. Reads the command line from
 * `runtime.proc.argv`, skipping the `download` subcommand token.
 * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime
 * @returns {Promise<void>}
 */
async function execTrailingCommand(runtime) {
  // Skip node/bun, the bin path, and the `download` subcommand token.
  const args = runtime.proc.argv.slice(3);
  const sep = args.indexOf("--");
  const line = sep === -1 ? [] : args.slice(sep + 1);
  if (line.length === 0) return;

  const [command, ...commandArgs] = line;
  const child = runtime.subprocess.spawn(command, commandArgs, {
    stdio: "inherit",
    env: runtime.proc.env,
  });
  for (const signal of ["SIGTERM", "SIGINT", "SIGQUIT"]) {
    runtime.proc.on(signal, () => child.kill(signal));
  }
  const [code, signal] = await Promise.all([child.exitCode, child.signal]);
  runtime.proc.exit(signal ? 1 : code || 0);
}

/**
 * `fit-codegen download` — download the generated code bundle from remote
 * storage and unpack it, then optionally exec a trailing `-- <command>`.
 * Carries none of the generation toolchain, so a production image can fetch the
 * bundle without the proto compiler.
 * @param {object} ctx
 * @param {import("@forwardimpact/libutil/runtime").Runtime} ctx.runtime
 * @returns {Promise<void>}
 */
export async function run({ runtime }) {
  const logger = createLogger("generated", runtime);

  await createScriptConfig("download-bundle");
  const downloader = createBundleDownloader(createStorage, logger, runtime);
  await downloader.download();

  await execTrailingCommand(runtime);
}
