---
name: libui
description: >
  libui - Web UI framework: rendering, routing, CSS. Generic DOM helpers,
  reactive state, hash-based routing, browser YAML loading, reusable
  components, and a layered CSS design system. Use when building or modifying
  shared web UI used across products.
---

# libui Skill

## When to Use

- Adding or modifying generic UI components (cards, grids, lists, nav)
- Changing the CSS design system (tokens, reset, component styles)
- Working on routing logic (hash-based SPA routing, slides navigation)
- Modifying reactive state management or the store factory
- Updating browser-side YAML loading utilities
- Adding shared rendering helpers (DOM element factories)

## Package Structure

```
libraries/libui/src/
  render.js          # DOM helpers: createElement, tag functions, render()
  reactive.js        # createReactive, createComputed, bind
  state.js           # createStore factory (pub/sub state management)
  errors.js          # NotFoundError, InvalidCombinationError, DataLoadError
  error-boundary.js  # withErrorBoundary wrapper for route handlers
  router-core.js     # createRouter: hash-based routing with pattern matching
  router-pages.js    # createPagesRouter: simple page routing factory
  router-slides.js   # createSlideRouter: keyboard nav, chapter boundaries
  yaml-loader.js     # loadYamlFile, tryLoadYamlFile, loadDirIndex
  markdown.js        # markdownToHtml
  utils.js           # getItemsByIds
  components/
    card.js          # createCard, createStatCard, createBadge, createTag
    grid.js          # createAutoGrid, createFixedGrid, createSelectorGrid, ...
    list.js          # createSearchBar, createCardList, createGroupedList
    detail.js        # createDetailHeader, createDetailSection, createLinksList
    nav.js           # updateActiveNav, createBackLink, createBreadcrumbs
    error-page.js    # renderNotFound, renderError
  css/
    tokens.css       # Design tokens (colours, spacing, typography)
    reset.css        # CSS reset
    base.css         # Base element styles
    components/      # Layout, surfaces, typography, badges, buttons, ...
    pages/           # Page-specific styles (detail)
    views/           # Slide, print, and handout styles
```

## Key Concepts

**DOM helpers**: `createElement(tag, attrs, ...children)` plus named shortcuts
(`div`, `span`, `h1`, etc.) for building DOM trees without a framework.

**createStore**: Generic pub/sub state factory. Products define their own state
shape and convenience accessors on top.

**createRouter**: Hash-based SPA router with pattern matching (`#/path/:id`),
error boundary wrapping, and configurable container.

**CSS @layer system**: Styles are organised in layers (`reset`, `base`,
`components`, `pages`, `views`) composed by bundle files (app.css, slides.css,
handout.css).

## Usage Patterns

### Pattern 1: DOM rendering

```javascript
import { div, h2, p, render } from "@forwardimpact/libui/render";

render(div({ class: "card" }, h2({}, "Title"), p({}, "Content")));
```

### Pattern 2: State management

```javascript
import { createStore } from "@forwardimpact/libui/state";

const store = createStore({ count: 0 });
store.subscribe((state) => console.log(state.count));
store.updateState({ count: 1 });
```

### Pattern 3: Routing

```javascript
import { createPagesRouter } from "@forwardimpact/libui/router-pages";

createPagesRouter({
  routes: { "/": homePage, "/about": aboutPage },
  notFound: notFoundPage,
});
```

### Pattern 4: Browser YAML loading

```javascript
import { loadYamlFile, loadDirIndex } from "@forwardimpact/libui/yaml-loader";

const data = await loadYamlFile("/data/config.yaml");
const files = await loadDirIndex("/data/skills/");
```

## CSS Integration

Products import shared CSS via absolute paths in bundle files:

```css
@import "/ui/css/tokens.css" layer(reset);
@import "/ui/css/components/layout.css" layer(components);
```

Product-specific CSS uses relative paths alongside shared imports.

## Integration

Used by Pathway (and future products) for all generic web UI. Products keep
domain-specific rendering, formatters, and page logic locally while delegating
shared infrastructure to libui.
