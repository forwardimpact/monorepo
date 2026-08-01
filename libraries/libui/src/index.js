/**
 * @forwardimpact/libui
 *
 * Web UI framework: render helpers, routers, components, and a design system.
 */

// Core rendering
export {
  createElement,
  div,
  span,
  h1,
  h2,
  h3,
  h4,
  p,
  a,
  ul,
  li,
  table,
  thead,
  tbody,
  tr,
  th,
  td,
  pre,
  code,
  button,
  input,
  select,
  option,
  optgroup,
  label,
  form,
  section,
  article,
  header,
  footer,
  nav,
  main,
  details,
  summary,
  heading1,
  heading2,
  heading3,
  fragment,
  getContainer,
  render,
  showLoading,
  showError,
  formatLevel,
} from "./render.js";

// Reactive state
export { createReactive, createComputed, bind } from "./reactive.js";

// State store
export { createStore } from "./state.js";

// Errors
export {
  NotFoundError,
  InvalidCombinationError,
  DataLoadError,
} from "./errors.js";

// Error boundary
export { withErrorBoundary } from "./error-boundary.js";

// Routing
export { createRouter } from "./router-core.js";
export { createPagesRouter } from "./router-pages.js";
export { createSlideRouter } from "./router-slides.js";

// Markdown
export { markdownToHtml } from "./markdown.js";

// Utilities
export { getItemsByIds } from "./utils.js";

// Invocation context
export { freezeInvocationContext } from "./invocation-context.js";

// Route descriptors and bound router
export { defineRoute } from "./route-descriptor.js";
export { createBoundRouter } from "./bound-router.js";

// UI helpers tied to the bound router
export { createCommandBar } from "./command-bar.js";
export { createJsonLdScript } from "./json-ld-script.js";
