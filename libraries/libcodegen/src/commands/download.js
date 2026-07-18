import { spawn } from "node:child_process";

import { createScriptConfig } from "@forwardimpact/libconfig";
import { createStorage } from "@forwardimpact/libstorage";
import { createLogger } from "@forwardimpact/libtelemetry";
import { createBundleDownloader, execLine } from "@forwardimpact/libutil";

/**
 * `fit-codegen download` — download the generated code bundle from remote
 * storage and unpack it, then optionally exec a trailing `-- <command>`. Ports
 * `fit-download-bundle`; carries none of the generation toolchain.
 * @param {object} ctx
 * @param {import("@forwardimpact/libutil/runtime").Runtime} ctx.runtime
 * @returns {Promise<void>}
 */
export async function run({ runtime }) {
  const logger = createLogger("generated", runtime);

  await createScriptConfig("download-bundle");
  const downloader = createBundleDownloader(createStorage, logger, runtime);
  await downloader.download();

  // If additional arguments follow `--`, execute them after the download.
  // Shift 1 skips the `download` subcommand token so `-- <command>` resolves
  // the same as it did for the bare `fit-download-bundle` bin.
  execLine(1, { spawn, process });
}
