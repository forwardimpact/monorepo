/**
 * Command Factory
 *
 * Provides factory functions to create CLI commands with standard behavior.
 * Reduces boilerplate and ensures consistency across commands.
 *
 * All entity commands support three modes:
 * - Base (no args): Concise summary with stats
 * - --list: Clean newline-separated list of IDs (for piping)
 * - <id>: Detailed entity view
 * - --validate: Run data validation checks
 */

import { capitalize } from "../formatters/shared.js";

/**
 * Create an entity command with standard behavior
 * @param {Object} config - Command configuration
 * @param {string} config.entityName - Entity name (singular, e.g., 'skill')
 * @param {string} config.pluralName - Entity name (plural, e.g., 'skills')
 * @param {Function} config.findEntity - Function to find entity by ID: (data, id) => entity
 * @param {Function} config.presentDetail - Function to present detail: (entity, data, options) => view
 * @param {Function} config.formatSummary - Function to format summary output: (items, data) => void
 * @param {Function} config.formatDetail - Function to format detail output: (view, framework) => void
 * @param {Function} [config.sortItems] - Optional function to sort items: (items) => sortedItems
 * @param {Function} [config.validate] - Optional validation function: (data) => {errors: [], warnings: []}
 * @param {string} [config.emojiIcon] - Optional emoji for the entity
 * @returns {Function} Command handler
 */
export function createEntityCommand({
  entityName,
  pluralName,
  findEntity,
  presentDetail,
  formatSummary,
  formatDetail,
  sortItems,
  validate,
  _emojiIcon = "",
}) {
  return async function runCommand({ data, args, options }) {
    const [id] = args;
    const rawItems = data[pluralName];
    const items = sortItems ? sortItems(rawItems) : rawItems;

    // --validate: Run validation checks
    if (options.validate) {
      return handleValidate({ data, entityName, pluralName, validate });
    }

    // --list: Output clean newline-separated IDs for piping
    if (options.list) {
      for (const item of items) {
        console.log(item.id);
      }
      return;
    }

    // No args: Show summary
    if (!id) {
      if (options.json) {
        console.log(JSON.stringify(items, null, 2));
        return;
      }
      formatSummary(items, data);
      return;
    }

    // With ID: Show detail
    return handleDetail({
      data,
      id,
      options,
      entityName,
      pluralName,
      findEntity,
      presentDetail,
      formatDetail,
    });
  };
}

/**
 * Handle validation for an entity type
 * @param {Object} params
 */
function handleValidate({ data, _entityName, pluralName, validate }) {
  if (!validate) {
    console.log(`No specific validation for ${pluralName}.`);
    console.log(`Run 'npx pathway --validate' for full data validation.`);
    return;
  }

  const result = validate(data);
  const { errors = [], warnings = [] } = result;

  if (errors.length === 0 && warnings.length === 0) {
    console.log(`✅ ${capitalize(pluralName)} validation passed`);
    return;
  }

  if (warnings.length > 0) {
    console.log(`⚠️  Warnings:`);
    for (const w of warnings) {
      console.log(`  - ${w}`);
    }
  }

  if (errors.length > 0) {
    console.log(`❌ Errors:`);
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
    process.exit(1);
  }
}

/**
 * Handle detail view for an entity
 * @param {Object} params
 */
function handleDetail({
  data,
  id,
  options,
  entityName,
  pluralName,
  findEntity,
  presentDetail,
  formatDetail,
}) {
  const entity = findEntity(data, id);

  if (!entity) {
    console.error(`${capitalize(entityName)} not found: ${id}`);
    console.error(`Available: ${data[pluralName].map((e) => e.id).join(", ")}`);
    process.exit(1);
  }

  const view = presentDetail(entity, data, options);

  if (!view) {
    console.error(`Failed to present ${entityName}: ${id}`);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }

  formatDetail(view, data.framework);
}

/**
 * Create a composite command for multi-entity operations (job, interview, progress)
 * @param {Object} config - Command configuration
 * @param {string} config.commandName - Command name for error messages
 * @param {string[]} config.requiredArgs - Array of required argument names
 * @param {Function} config.findEntities - Function to find entities: (data, args, options) => entities object
 * @param {Function} config.validateEntities - Function to validate entities: (entities, data, options) => error string | null
 * @param {Function} config.presenter - Function to present data: (entities, data, options) => view
 * @param {Function} config.formatter - Function to format output: (view, options, data) => void
 * @param {string} [config.usageExample] - Optional usage example
 * @returns {Function} Command handler
 */
export function createCompositeCommand({
  commandName,
  requiredArgs,
  findEntities,
  validateEntities,
  presenter,
  formatter,
  usageExample,
}) {
  return async function runCommand({ data, args, options }) {
    if (args.length < requiredArgs.length) {
      const argsList = requiredArgs.map((arg) => `<${arg}>`).join(" ");
      console.error(`Usage: npx pathway ${commandName} ${argsList}`);
      if (usageExample) {
        console.error(`Example: ${usageExample}`);
      }
      process.exit(1);
    }

    const entities = findEntities(data, args, options);
    const validationError = validateEntities(entities, data, options);

    if (validationError) {
      console.error(validationError);
      process.exit(1);
    }

    const view = presenter(entities, data, options);

    if (!view) {
      console.error(`Failed to generate ${commandName} output.`);
      process.exit(1);
    }

    if (options.json) {
      console.log(JSON.stringify(view, null, 2));
      return;
    }

    formatter(view, options, data);
  };
}

// Legacy alias for backward compatibility during refactor
export const createListDetailCommand = createEntityCommand;
