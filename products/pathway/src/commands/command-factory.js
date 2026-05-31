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
import {
  formatSuccess,
  formatWarning,
  formatError,
  formatBullet,
} from "@forwardimpact/libcli";

/**
 * Create an entity command with standard behavior
 * @param {Object} config - Command configuration
 * @param {string} config.entityName - Entity name (singular, e.g., 'skill')
 * @param {string} config.pluralName - Entity name (plural, e.g., 'skills')
 * @param {Function} config.findEntity - Function to find entity by ID: (data, id) => entity
 * @param {Function} config.presentDetail - Function to present detail: (entity, data, options) => view
 * @param {Function} config.formatSummary - Function to format summary output: (items, data) => void
 * @param {Function} config.formatDetail - Function to format detail output: (view, standard) => void
 * @param {Function} [config.formatListItem] - Optional function to format list item: (item) => string (defaults to item.id)
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
  formatListItem,
  sortItems,
  validate,
  _emojiIcon = "",
}) {
  return async function runCommand({ data, args, options, runtime }) {
    const [id] = args;
    const rawItems = data[pluralName];
    const items = sortItems ? sortItems(rawItems) : rawItems;

    // --validate: Run validation checks
    if (options.validate) {
      return handleValidate({
        data,
        entityName,
        pluralName,
        validate,
        runtime,
      });
    }

    // --list: Output one id per line for piping
    if (options.list) {
      return handleList(items, formatListItem, runtime);
    }

    // No args: Show summary
    if (!id) {
      return handleSummary(items, data, options, formatSummary, runtime);
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
      runtime,
    });
  };
}

/**
 * Handle --list mode: output one line per item
 * @param {Array} items
 * @param {Function|undefined} formatListItem
 */
function handleList(items, formatListItem, runtime) {
  for (const item of items) {
    runtime.proc.stdout.write(
      (formatListItem ? formatListItem(item) : item.id) + "\n",
    );
  }
}

/**
 * Handle summary mode (no ID): JSON or formatted
 * @param {Array} items
 * @param {Object} data
 * @param {Object} options
 * @param {Function} formatSummary
 */
function handleSummary(items, data, options, formatSummary, runtime) {
  if (options.json) {
    runtime.proc.stdout.write(JSON.stringify(items, null, 2) + "\n");
    return;
  }
  formatSummary(items, data, runtime);
}

/**
 * Handle validation for an entity type
 * @param {Object} params
 */
function handleValidate({ data, _entityName, pluralName, validate, runtime }) {
  if (!validate) {
    runtime.proc.stdout.write(
      formatBullet(`No specific validation for ${pluralName}.`, 0) + "\n",
    );
    runtime.proc.stdout.write(
      formatBullet(
        "Run 'npx fit-pathway --validate' for full data validation.",
        0,
      ) + "\n",
    );
    return;
  }

  const result = validate(data);
  const { errors = [], warnings = [] } = result;

  if (errors.length === 0 && warnings.length === 0) {
    runtime.proc.stdout.write(
      formatSuccess(`${capitalize(pluralName)} validation passed`) + "\n",
    );
    return;
  }

  if (warnings.length > 0) {
    runtime.proc.stdout.write(
      formatWarning(`${warnings.length} warning(s)`) + "\n",
    );
    for (const w of warnings) {
      runtime.proc.stdout.write(formatBullet(w, 1) + "\n");
    }
  }

  if (errors.length > 0) {
    runtime.proc.stderr.write(formatError(`${errors.length} error(s)`) + "\n");
    for (const e of errors) {
      runtime.proc.stderr.write(formatBullet(e, 1) + "\n");
    }
    runtime.proc.exit(1);
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
  runtime,
}) {
  const entity = findEntity(data, id);

  if (!entity) {
    runtime.proc.stderr.write(
      formatError(`${capitalize(entityName)} not found: ${id}`) + "\n",
    );
    runtime.proc.stderr.write(
      `Available: ${data[pluralName].map((e) => e.id).join(", ")}\n`,
    );
    runtime.proc.exit(1);
  }

  const view = presentDetail(entity, data, options);

  if (!view) {
    runtime.proc.stderr.write(
      formatError(`Failed to present ${entityName}: ${id}`) + "\n",
    );
    runtime.proc.exit(1);
  }

  if (options.json) {
    runtime.proc.stdout.write(JSON.stringify(view, null, 2) + "\n");
    return;
  }

  formatDetail(view, data.standard, runtime);
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
  return async function runCommand({ data, args, options, runtime }) {
    if (args.length < requiredArgs.length) {
      const argsList = requiredArgs.map((arg) => `<${arg}>`).join(" ");
      runtime.proc.stderr.write(
        formatError(`Usage: npx fit-pathway ${commandName} ${argsList}`) + "\n",
      );
      if (usageExample) {
        runtime.proc.stderr.write(`Example: ${usageExample}\n`);
      }
      runtime.proc.exit(1);
    }

    const entities = findEntities(data, args, options, runtime);
    const validationError = validateEntities(entities, data, options);

    if (validationError) {
      runtime.proc.stderr.write(formatError(validationError) + "\n");
      runtime.proc.exit(1);
    }

    const view = presenter(entities, data, options);

    if (!view) {
      runtime.proc.stderr.write(
        formatError(`Failed to generate ${commandName} output.`) + "\n",
      );
      runtime.proc.exit(1);
    }

    if (options.json) {
      runtime.proc.stdout.write(JSON.stringify(view, null, 2) + "\n");
      return;
    }

    formatter(view, options, data, runtime);
  };
}

// Legacy alias for backward compatibility during refactor
export const createListDetailCommand = createEntityCommand;
