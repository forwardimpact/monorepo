---
title: "Build a Web Surface with libui"
description: "Assemble the browser side of a shared capability — components, reactive state, a global store, routing, slide decks, and an error boundary that keeps a bad page from blanking the whole app."
---

The [shared-surface guide](/docs/libraries/every-surface/) shows the route
descriptor that binds one presenter to both the terminal and the browser. The
browser still needs a body: cards and grids to render the view, state that
reacts when the user types in a search box, and a router that survives a handler
that throws. `@forwardimpact/libui` ships all of it as small functions you
compose, so the web side of a capability is assembled, not hand-built from raw
DOM.

## Prerequisites

- Node.js 22+
- Install libui:

```sh
npm install @forwardimpact/libui
```

This page assumes you have read the
[shared-surface guide](/docs/libraries/every-surface/) and have a working
`createBoundRouter` with at least one `defineRoute`. Everything here renders
into the page that router displays.

## Build the page from components

libui's component functions return plain DOM elements. You pass a config object
and get back a node you can hand to `render` or nest inside another component.
There are fourteen-plus factories; these are the ones most pages reach for.

```js
import { render, div } from "@forwardimpact/libui";
import {
  createCard,
  createStatCard,
  createAutoGrid,
  createDetailHeader,
} from "@forwardimpact/libui/components";

function renderCity(view) {
  const header = createDetailHeader({
    title: view.city,
    description: `${view.condition}, ${view.wind}`,
    backLink: "/",
    backText: "← All cities",
  });

  const stats = createAutoGrid("xs", [
    createStatCard({ value: view.temp, label: `Temp (${view.units})` }),
    createStatCard({ value: view.wind, label: "Wind" }),
  ]);

  const detail = createCard({
    title: "Forecast",
    description: view.condition,
  });

  render(div({ className: "page" }, header, stats, detail));
}
```

A card with an `href` becomes clickable and navigates by setting the URL hash,
so cards link into other routes without any extra wiring. `createAutoGrid` takes
a size (`xs`, `sm`, `md`, `lg`) that sets the minimum column width and reflows
to fit the viewport.

The factory families group by purpose:

| Family       | Functions                                                                            | Use for                                  |
| ------------ | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| Cards        | `createCard`, `createStatCard`, `createBadge`, `createTag`                            | Summary tiles and labels                 |
| Grids        | `createAutoGrid`, `createStatsGrid`, `createCardGrid`, `createDetailGrid`             | Responsive layout of any children        |
| Lists        | `createSearchBar`, `createCardList`, `createGroupedList`                              | Filterable collections                   |
| Detail views | `createDetailHeader`, `createDetailSection`, `createLinksList`, `createDetailItem`    | Single-record pages                      |
| Navigation   | `createBreadcrumbs`, `createBackLink`, `updateActiveNav`                              | Wayfinding                               |
| Error pages  | `createNotFound`, `createErrorMessage`                                                | Friendly dead ends                       |

## React to input with local state

A search box needs to filter a list as the user types without re-fetching data
or re-registering the route. `createReactive` holds a value, notifies
subscribers when it changes, and hands back an unsubscribe function.

```js
import { createReactive, createComputed, render, div } from "@forwardimpact/libui";
import { createSearchBar, createCardList } from "@forwardimpact/libui/components";

function renderCityList(cities) {
  const query = createReactive("");

  const visible = createComputed(
    () =>
      cities.filter((c) =>
        c.name.toLowerCase().includes(query.get().toLowerCase()),
      ),
    [query],
  );

  const list = createCardList(visible.get(), (city) => ({
    title: city.name,
    description: city.condition,
    href: `/forecast/${city.id}`,
  }));

  visible.subscribe((rows) => {
    list.replaceWith(
      createCardList(rows, (city) => ({
        title: city.name,
        href: `/forecast/${city.id}`,
      })),
    );
  });

  const search = createSearchBar({ onSearch: (value) => query.set(value) });

  render(div({ className: "page" }, search, list));
}
```

`createComputed` derives a value from one or more reactives and recomputes
whenever any dependency changes. `bind` is the third reactive helper: it ties a
reactive value directly to an element property, so `bind(count, badge, "textContent")`
keeps a badge in sync without a manual subscriber.

Reactive state is local to one page render. For values that several routes read
and write — a logged-in user, a loaded dataset, a theme — use the global store.

## Share state across routes with a store

`createStore` holds one state object behind dot-notation access. Any part of the
app reads a path, writes a path, or subscribes to every change.

```js
import { createStore } from "@forwardimpact/libui";

const store = createStore({
  user: null,
  data: { cities: [] },
});

// Read
const cities = store.getStatePath("data.cities");

// Write — notifies every subscriber
store.updateState("user", { id: "ada", name: "Ada" });

// React anywhere
const unsubscribe = store.subscribe((state) => {
  console.log("store changed", state.user);
});
```

A reactive is the right tool for state that lives and dies with a single page; a
store is the right tool for state that outlives any one route.

## Survive a handler that throws

A page handler that throws should not blank the entire application. Wrap a render
function with `withErrorBoundary` and a thrown error renders a friendly message
instead of an empty screen.

```js
import { withErrorBoundary } from "@forwardimpact/libui";

const safePage = withErrorBoundary(renderCity, {
  backPath: "/",
  backText: "← Back to Home",
  onError: (error) => console.error("page failed", error),
});
```

The bound router from the shared-surface guide already wraps every registered
`page` in an error boundary, so you get this protection for free on routed
pages. Reach for `withErrorBoundary` directly only when you render outside the
router — for example, a one-off page mounted at startup. The boundary recognises
libui's `NotFoundError` and `InvalidCombinationError` and renders the matching
message; any other error falls back to a generic notice.

## Present a guided sequence with the slide router

Some surfaces are a linear walkthrough — an onboarding tour, a generated report
deck — rather than a tree of pages. `createSlideRouter` extends the core router
with an ordered sequence and keyboard navigation.

```js
import { createSlideRouter } from "@forwardimpact/libui";

const slides = createSlideRouter();

slides.on("/intro", () => render(introSlide()));
slides.on("/results", () => render(resultsSlide()));
slides.on("/next-steps", () => render(nextStepsSlide()));

slides.setSlideOrder(["/intro", "/results", "/next-steps"]);
slides.startKeyboardNav();
slides.start();
```

Once an order is set, arrow keys, space, and `PageUp`/`PageDown` move between
slides; `Home` and `Escape` return to the first. `setSlideOrder` accepts chapter
boundaries as a second argument, and `ArrowUp`/`ArrowDown` then jump between
chapters. Use the slide router for sequences and the bound router for everything
else; they are separate tools, not layered.

## Emit a machine-readable channel alongside the page

The route descriptor carries three channels, not two. `page` renders for people,
`cli` shows the terminal equivalent in the command bar, and `graph` emits a
machine-readable representation of the same route — a Turtle or JSON-LD fragment
an agent can consume without scraping the HTML.

```js
import { defineRoute } from "@forwardimpact/libui";

router.register(defineRoute({
  pattern: "/forecast/:city",
  page: (ctx) => renderCity(presentForecast(ctx)),
  cli: (ctx) => `weather forecast ${ctx.args.city}`,
  graph: (ctx, vocabularyBase) => {
    const view = presentForecast(ctx);
    return `<${vocabularyBase}/city/${ctx.args.city}> a <${vocabularyBase}/Forecast> ;
  <${vocabularyBase}/temp> ${view.temp} .`;
  },
}));
```

All three channels call the same presenter, so the page a person sees, the
command an agent copies, and the graph fragment a crawler reads never disagree.
`graph` is optional — routes without it simply offer no machine channel.

## Verify

- [ ] A `createCard` with an `href` navigates to that hash when clicked.
- [ ] Typing in a `createSearchBar` updates the reactive and re-renders the
      filtered list.
- [ ] `store.updateState(path, value)` fires every subscriber registered with
      `store.subscribe`.
- [ ] A page handler that throws renders the error boundary's message instead of
      a blank screen.
- [ ] Arrow keys move between slides once `setSlideOrder` and `startKeyboardNav`
      are called.
- [ ] A route with a `graph` function returns a fragment built from the same
      presenter as its `page`.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../add-capability -->

</div>
