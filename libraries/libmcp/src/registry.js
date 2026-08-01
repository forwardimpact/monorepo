import * as types from "@forwardimpact/libtype";
import { metadata } from "@forwardimpact/libtype";
import { buildZodSchema } from "./schema.js";

/**
 * Normalizes raw MCP tool params against field metadata.
 * Repeated fields become arrays. Scalar fields default to an empty string.
 * @param {object} params - Raw params from an MCP tool call
 * @param {object} fields - Field metadata from codegen
 * @returns {object} Normalized params
 */
function normalizeParams(params, fields) {
  const normalized = {};
  for (const [k, v] of Object.entries(params)) {
    const field = fields[k];
    if (field?.repeated) {
      normalized[k] = Array.isArray(v) ? v : v ? [v] : [];
    } else {
      normalized[k] = v ?? "";
    }
  }
  return normalized;
}

/**
 * Register MCP tools from config endpoints with codegen metadata.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {object} config - Config instance with .tools (from createServiceConfig("mcp"))
 * @param {object} clients - gRPC clients keyed by package name (e.g. { graph, vector, pathway })
 * @param {object} [resourceIndex] - Optional ResourceIndex that resolves identifiers to content
 */
export function registerToolsFromConfig(
  server,
  config,
  clients,
  resourceIndex = null,
) {
  const tools = config.tools;
  if (!tools || Object.keys(tools).length === 0) return;

  for (const [toolName, endpoint] of Object.entries(tools)) {
    const [packageName, serviceName, methodName] = endpoint.method.split(".");
    const serviceKey = `${packageName}.${serviceName}`;
    const methodMeta = metadata[serviceKey]?.[methodName];

    if (!methodMeta) {
      throw new Error(
        `registerToolsFromConfig: no metadata for ${endpoint.method}`,
      );
    }

    // Resolve the request type class from libtype
    const [reqPkg, reqTypeName] = methodMeta.requestType.split(".");
    const RequestClass = types[reqPkg]?.[reqTypeName];
    if (!RequestClass?.fromObject) {
      throw new Error(
        `registerToolsFromConfig: no libtype class for ${methodMeta.requestType}`,
      );
    }

    const client = clients[packageName];
    if (!client) {
      throw new Error(
        `registerToolsFromConfig: no client for package "${packageName}"`,
      );
    }

    const schema = buildZodSchema(methodMeta.fields);

    server.tool(toolName, endpoint.description, schema, async (params) => {
      const normalized = normalizeParams(params, methodMeta.fields);
      const req = RequestClass.fromObject(normalized);
      const result = await client[methodName](req);
      return {
        content: [
          {
            type: "text",
            text: result.identifiers?.length
              ? await resolveIdentifiers(result.identifiers, resourceIndex)
              : result.content || "",
          },
        ],
      };
    });
  }
}

/**
 * Resolves resource identifiers to full content through ResourceIndex.
 * Falls back to JSON.stringify when the caller provides no resourceIndex.
 * @param {object[]} identifiers - Array of resource identifiers
 * @param {object|null} resourceIndex - ResourceIndex instance or null
 * @returns {Promise<string>} Resolved content or JSON fallback
 */
async function resolveIdentifiers(identifiers, resourceIndex) {
  if (!resourceIndex) return JSON.stringify(identifiers);

  const ids = identifiers.map((id) => String(id));
  const resources = await resourceIndex.get(ids, "common.System.root");
  const content = resources
    .map((r) => r.content)
    .filter((text) => text && text.length > 0)
    .join("\n\n");

  return content || "No results found.";
}
