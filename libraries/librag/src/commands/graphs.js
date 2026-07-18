import { createResourceIndex } from "@forwardimpact/libresource";
import { createLogger } from "@forwardimpact/libtelemetry";

import { createGraphIndex } from "@forwardimpact/libgraph";
import { GraphProcessor } from "@forwardimpact/libgraph/processor/graph.js";

/**
 * `fit-process graphs` — process resources into RDF graphs (the `graphs`
 * index). Ports `fit-process graphs`, keeping its own actor constant.
 * @param {object} ctx
 * @param {import("@forwardimpact/libutil/runtime").Runtime} ctx.runtime
 * @returns {Promise<void>}
 */
export async function run({ runtime }) {
  const logger = createLogger("graphs", runtime);

  const resourceIndex = createResourceIndex("resources");
  const graphIndex = createGraphIndex("graphs", runtime.clock);

  const processor = new GraphProcessor(graphIndex, resourceIndex, logger);

  const actor = "cld:common.System.root";

  // Process resources into RDF graphs (content only)
  await processor.process(actor);
}
