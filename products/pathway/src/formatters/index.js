/**
 * Formatter Layer
 *
 * Export all formatters for easy importing.
 * Formatters transform presenter output into specific formats (DOM, markdown, microdata)
 */

// Shared utilities
export * from "./shared.js";

// Job formatters
export { jobToMarkdown } from "./job/markdown.js";
export { jobToDOM } from "./job/dom.js";

// Interview formatters
export { interviewToMarkdown } from "./interview/markdown.js";
export { interviewToDOM } from "./interview/dom.js";

// Progress formatters
export { progressToMarkdown } from "./progress/markdown.js";
export { progressToDOM } from "./progress/dom.js";

// Driver formatters
export { driverToDOM } from "./driver/dom.js";

// Skill formatters
export { skillListToMarkdown, skillToMarkdown } from "./skill/markdown.js";
export { skillToDOM } from "./skill/dom.js";

// Behaviour formatters
export {
  behaviourListToMarkdown,
  behaviourToMarkdown,
} from "./behaviour/markdown.js";
export { behaviourToDOM } from "./behaviour/dom.js";

// Discipline formatters
export {
  disciplineListToMarkdown,
  disciplineToMarkdown,
} from "./discipline/markdown.js";
export { disciplineToDOM } from "./discipline/dom.js";

// Level formatters
export { levelListToMarkdown, levelToMarkdown } from "./level/markdown.js";
export { levelToDOM } from "./level/dom.js";

// Track formatters
export { trackListToMarkdown, trackToMarkdown } from "./track/markdown.js";
export { trackToDOM } from "./track/dom.js";

// JSON-LD formatters
export {
  createJsonLdScript,
  skillToJsonLd,
  behaviourToJsonLd,
  disciplineToJsonLd,
  trackToJsonLd,
  levelToJsonLd,
  driverToJsonLd,
  stageToJsonLd,
} from "./json-ld.js";
