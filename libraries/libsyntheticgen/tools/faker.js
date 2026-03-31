/**
 * Faker tool — generates datasets using @faker-js/faker in-process.
 */

export class FakerTool {
  #faker;

  /**
   * @param {object} deps
   * @param {object} deps.logger
   */
  constructor({ logger }) {
    if (!logger) throw new Error("FakerTool requires logger");
    this.logger = logger;
  }

  /**
   * Lazily load the faker module.
   * @returns {Promise<object>}
   */
  async #loadFaker() {
    if (this.#faker) return this.#faker;
    try {
      const mod = await import("@faker-js/faker");
      this.#faker = mod.faker;
    } catch {
      throw new Error(
        "FakerTool requires @faker-js/faker. Install with: bun add @faker-js/faker",
      );
    }
    return this.#faker;
  }

  /**
   * Check that faker is available.
   * @returns {Promise<boolean>}
   */
  async checkAvailability() {
    await this.#loadFaker();
    return true;
  }

  /**
   * Generate a dataset from field definitions.
   * @param {object} config
   * @param {string} config.name - Dataset name from DSL
   * @param {number} config.rows - Number of records to generate
   * @param {Object<string, string>} config.fields - Field name → Faker provider path
   * @param {number} config.seed - RNG seed
   * @returns {Promise<Dataset[]>}
   */
  async generate(config) {
    const faker = await this.#loadFaker();
    faker.seed(config.seed);
    this.logger.info(
      "faker",
      `Generating ${config.rows} rows for ${config.name}`,
    );
    const records = [];
    for (let i = 0; i < config.rows; i++) {
      const record = {};
      for (const [field, provider] of Object.entries(config.fields)) {
        record[field] = this.#callProvider(faker, provider);
      }
      records.push(record);
    }
    return [
      {
        name: config.name,
        schema: null,
        records,
        metadata: { tool: "faker", fields: config.fields },
      },
    ];
  }

  /**
   * Resolve a dotted provider path like "person.fullName" to a Faker call.
   * @param {object} faker
   * @param {string} provider
   * @returns {*}
   */
  #callProvider(faker, provider) {
    const parts = provider.split(".");
    let fn = faker;
    for (const part of parts) {
      fn = fn[part];
      if (!fn) throw new Error(`Unknown Faker provider: ${provider}`);
    }
    if (typeof fn !== "function") {
      throw new Error(`Faker provider "${provider}" is not a function`);
    }
    return fn();
  }
}

/**
 * @param {object} logger
 * @returns {FakerTool}
 */
export function createFakerTool(logger) {
  return new FakerTool({ logger });
}
