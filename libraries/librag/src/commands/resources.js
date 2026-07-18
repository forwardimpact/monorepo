import { createScriptConfig } from "@forwardimpact/libconfig";
import { createResourceIndex } from "@forwardimpact/libresource";
import { createStorage } from "@forwardimpact/libstorage";
import { createLogger } from "@forwardimpact/libtelemetry";

import { ResourceProcessor } from "@forwardimpact/libresource/processor/resource.js";
import { Parser } from "@forwardimpact/libresource/parser.js";
import { Skolemizer } from "@forwardimpact/libresource/skolemizer.js";

/**
 * `fit-process resources` — process HTML files in the knowledge base
 * directory into the `resources` index. Ports `fit-process resources`.
 * @param {object} ctx
 * @param {Record<string, string|boolean|undefined>} ctx.values - Parsed options (`base`)
 * @param {import("@forwardimpact/libutil/runtime").Runtime} ctx.runtime
 * @returns {Promise<void>}
 */
export async function run({ values, runtime }) {
  const logger = createLogger("resources", runtime);

  await createScriptConfig("resources");

  const base = values.base || "https://example.invalid/";
  const knowledgeStorage = createStorage("knowledge");

  const resourceIndex = createResourceIndex("resources");
  const skolemizer = new Skolemizer();
  const parser = new Parser(skolemizer, logger);

  const resourceProcessor = new ResourceProcessor(
    base,
    resourceIndex,
    knowledgeStorage,
    parser,
    logger,
  );
  await resourceProcessor.process(".html");
}
