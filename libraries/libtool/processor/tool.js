import { join } from "node:path";

import { parse as parseYaml } from "yaml";
import pkg from "protobufjs";
import { access } from "node:fs/promises";

import { ProcessorBase } from "@forwardimpact/libutil";
import { resource, tool } from "@forwardimpact/libtype";

import { generateSchemaFromProtobuf, buildToolDescription } from "../schema.js";

const { Root } = pkg;

/**
 * Batch processes tool endpoint configurations into tool resources.
 * Generates OpenAI-compatible JSON schemas from protobuf definitions
 * and stores them as ToolFunction resources.
 * @augments {ProcessorBase}
 */
export class ToolProcessor extends ProcessorBase {
  #resourceIndex;
  #configStorage;
  #protoRoot;
  #logger;

  /**
   * Creates a new ToolProcessor instance
   * @param {object} resourceIndex - Resource index for storing tool resources
   * @param {object} configStorage - Storage backend for configuration files
   * @param {string} protoRoot - Root directory containing proto/ and tools/ directories
   * @param {object} logger - Logger instance
   */
  constructor(resourceIndex, configStorage, protoRoot, logger) {
    super(logger);

    if (!resourceIndex) throw new Error("resourceIndex is required");
    if (!configStorage) throw new Error("configStorage is required");
    if (!protoRoot) throw new Error("protoRoot is required");

    this.#resourceIndex = resourceIndex;
    this.#configStorage = configStorage;
    this.#protoRoot = protoRoot;
    this.#logger = logger;
  }

  /**
   * Load tool endpoints configuration from config.json
   * @returns {Promise<object>} Tool endpoints configuration
   */
  async #loadToolEndpoints() {
    const data = await this.#configStorage.get("config.json");
    return data?.service?.tool?.endpoints || {};
  }

  /**
   * Load tool descriptors configuration from tools.yml
   * @returns {Promise<object>} Tool descriptors configuration
   */
  async #loadToolDescriptors() {
    const data = await this.#configStorage.get("tools.yml");
    return parseYaml(data.toString()) || {};
  }

  /**
   * Load protobuf root and extract service method schema
   * @param {string} protoPath - Path to the proto file
   * @param {string} serviceName - Service name
   * @param {string} methodName - Method name
   * @param {object} [paramDescriptions] - Parameter descriptions from descriptor
   * @returns {Promise<object>} JSON schema for the method request
   */
  async #loadMethodSchema(
    protoPath,
    serviceName,
    methodName,
    paramDescriptions = {},
  ) {
    const root = new Root();
    await root.load(protoPath, { keepCase: true });
    const service = root.lookupService(serviceName);
    const method = service.methods[methodName];

    if (!method) {
      throw new Error(
        `Method ${methodName} not found in service ${serviceName}`,
      );
    }

    const requestType = root.lookupType(method.requestType);
    return generateSchemaFromProtobuf(requestType, paramDescriptions);
  }

  /**
   * Processes tool endpoints and descriptors into tool resources
   * @returns {Promise<void>}
   */
  async process() {
    const [endpoints, descriptors] = await Promise.all([
      this.#loadToolEndpoints(),
      this.#loadToolDescriptors(),
    ]);

    if (Object.keys(endpoints).length === 0) {
      this.#logger.debug("Processor", "No tool endpoints configured");
      return;
    }

    // Build items array from endpoints paired with descriptors
    const items = Object.entries(endpoints).map(([name, endpoint]) => ({
      name,
      endpoint,
      descriptor: descriptors[name] || {},
    }));

    await super.process(items, "tools");
  }

  /**
   * Processes a single tool endpoint into a ToolFunction resource
   * @param {object} item - Tool item with name, endpoint, and descriptor
   * @returns {Promise<object>} Stored ToolFunction resource
   */
  async processItem(item) {
    const { name, endpoint, descriptor } = item;

    const methodParts = endpoint.method.split(".");
    if (methodParts.length < 3) {
      throw new Error(
        `Invalid method format for tool ${name}: ${endpoint.method}`,
      );
    }

    const [packageName, serviceName, methodName] = methodParts;
    const fullServiceName = `${packageName}.${serviceName}`;

    // Resolve proto path: prefer tools/<package>.proto, fallback to proto/<package>.proto
    let protoPath = join(this.#protoRoot, "tools", `${packageName}.proto`);
    try {
      await access(protoPath);
    } catch {
      protoPath = join(this.#protoRoot, "proto", `${packageName}.proto`);
    }

    // Get parameter descriptions from descriptor
    const paramDescriptions = descriptor.parameters || {};

    // Generate JSON schema from protobuf definition
    const schema = await this.#loadMethodSchema(
      protoPath,
      fullServiceName,
      methodName,
      paramDescriptions,
    );

    // Ensure valid OpenAI function calling structure
    if (
      schema.required.length === 0 &&
      Object.keys(schema.properties).length > 0
    ) {
      // Tools with only optional parameters - keep required array empty
    } else if (schema.required.length === 0) {
      schema.required = Object.keys(schema.properties);
    }

    // Build description from descriptor fields
    const description = buildToolDescription(descriptor);

    // Convert to ToolParam protobuf format
    const toolParam = {
      type: schema.type || "object",
      properties: schema.properties || {},
      required: schema.required || [],
    };

    const func = tool.ToolFunction.fromObject({
      id: resource.Identifier.fromObject({
        name,
        type: "tool.ToolFunction",
      }),
      name,
      description,
      parameters: toolParam,
    });

    await this.#resourceIndex.put(func);
    this.#logger.debug("Processor", "Saved tool resource", { name });

    return func;
  }
}
