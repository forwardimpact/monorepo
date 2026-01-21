/**
 * Formatter Layer
 *
 * Export all formatters for easy importing.
 * Formatters transform presenter output into specific formats (DOM, markdown, microdata)
 */

// Shared utilities
export * from "./shared.js";
export * from "./microdata-shared.js";

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
export {
  driverListToMicrodata,
  driverToMicrodata,
} from "./driver/microdata.js";

// Skill formatters
export { skillListToMarkdown, skillToMarkdown } from "./skill/markdown.js";
export { skillToDOM } from "./skill/dom.js";
export { skillListToMicrodata, skillToMicrodata } from "./skill/microdata.js";

// Behaviour formatters
export {
  behaviourListToMarkdown,
  behaviourToMarkdown,
} from "./behaviour/markdown.js";
export { behaviourToDOM } from "./behaviour/dom.js";
export {
  behaviourListToMicrodata,
  behaviourToMicrodata,
} from "./behaviour/microdata.js";

// Discipline formatters
export {
  disciplineListToMarkdown,
  disciplineToMarkdown,
} from "./discipline/markdown.js";
export { disciplineToDOM } from "./discipline/dom.js";
export {
  disciplineListToMicrodata,
  disciplineToMicrodata,
} from "./discipline/microdata.js";

// Grade formatters
export { gradeListToMarkdown, gradeToMarkdown } from "./grade/markdown.js";
export { gradeToDOM } from "./grade/dom.js";
export { gradeListToMicrodata, gradeToMicrodata } from "./grade/microdata.js";

// Track formatters
export { trackListToMarkdown, trackToMarkdown } from "./track/markdown.js";
export { trackToDOM } from "./track/dom.js";
export { trackListToMicrodata, trackToMicrodata } from "./track/microdata.js";

// Stage formatters
export { stageListToMicrodata, stageToMicrodata } from "./stage/microdata.js";

// JSON-LD formatters
export {
  createJsonLdScript,
  skillToJsonLd,
  behaviourToJsonLd,
  disciplineToJsonLd,
  trackToJsonLd,
  gradeToJsonLd,
  driverToJsonLd,
  stageToJsonLd,
} from "./json-ld.js";
