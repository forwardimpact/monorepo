---
title: "Build a Web Surface with libui"
description: "Assemble the browser side of a shared capability. Use components, reactive state, a global store, routes, slide decks, and an error boundary. A bad page then does not blank the whole app."
---

The [shared-surface guide](/docs/libraries/every-surface/) shows the route
descriptor that binds one presenter to both the terminal and the browser. The
browser still needs a body. It needs cards and grids to render the view. It
needs state that reacts when the user types in a search box. It needs a router
that survives a handler that throws.

`@forwardimpact/libui` ships all of it as small functions you compose. You
assemble the web side of a capability. You do not hand-build it from raw DOM.

## Prerequisites

- Node.js 22+
- Install libui:

```sh
npm install @forwardimpact/libui
```

This page assumes you read the
[shared-surface guide](/docs/libraries/every-surface/). It also assumes you have
a `createBoundRouter` that works, with at least one `defineRoute`. Everything
here renders into the page that router displays.

## Build the page from components

libui's component functions return plain DOM elements. You pass a config object
and get back a node you can hand to `render` or nest inside another component.
The library has more than fourteen factories. Most pages use the ones below.

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

A card with an `href` becomes clickable. It sets the URL hash to navigate. So
cards link into other routes and you add no extra code. `createAutoGrid` takes a
size (`xs`, `sm`, `md`, `lg`). The size sets the minimum column width. The grid
reflows to fit the viewport.

The factory families group by purpose:

| Family       | Functions                                                                            | Use for                                  |
| ------------ | ------------------------------------------------------------------------------------ | ---------------------------------------- |
| Cards        | `createCard`, `createStatCard`, `createBadge`, `createTag`                            | Summary tiles and labels                 |
| Grids        | `createAutoGrid`, `createStatsGrid`, `createCardGrid`, `createDetailGrid`             | Responsive layout of any children        |
| Lists        | `createSearchBar`, `createCardList`, `createGroupedList`                              | Filterable collections                   |
| Detail views | `createDetailHeader`, `createDetailSection`, `createLinksList`, `createDetailItem`    | Single-record pages                      |
| Navigation   | `createBreadcrumbs`, `createBackLink`, `updateActiveNav`                              | Wayfinding                               |
| Error pages  | `createNotFound`, `createErrorMessage`                                                | Missing-page and error notices           |

## React to input with local state

A search box must filter a list as the user types. It must not re-fetch data. It
must not re-register the route. `createReactive` holds a value, notifies
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
whenever any dependency changes. `bind` is the third reactive helper. It ties a
reactive value directly to an element property. So
`bind(count, badge, "textContent")` keeps a badge in sync without a manual
subscriber.

Reactive state is local to one page render. Several routes read and write some
values. Examples are a logged-in user, a loaded dataset, and a theme. Use the
global store for those values.

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

Use a reactive for state that belongs to one page render. Use a store for
state that outlives any one route.

## Survive a handler that throws

A page handler that throws should not blank the entire application. Wrap a
render function with `withErrorBoundary`. A thrown error then renders a clear
message instead of an empty screen.

```js
import { withErrorBoundary } from "@forwardimpact/libui";

const safePage = withErrorBoundary(renderCity, {
  backPath: "/",
  backText: "← Back to Home",
  onError: (error) => console.error("page failed", error),
});
```

The bound router from the shared-surface guide already wraps every registered
`page` in an error boundary. So routed pages get this protection with no extra
code. Call `withErrorBoundary` directly only when you render outside the
router. An example is a one-off page mounted at startup.

The boundary recognizes libui's `NotFoundError` and `InvalidCombinationError`.
It renders the message that matches. Any other error falls back to a generic
notice.

## Present a guided sequence with the slide router

Some surfaces show a linear walkthrough instead of a tree of pages. Examples
are an onboarding tour and a generated report deck. `createSlideRouter` extends
the core router with an ordered sequence and keyboard navigation.

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

After you set an order, arrow keys, space, and `PageUp`/`PageDown` move between
slides. `Home` and `Escape` return to the first slide. `setSlideOrder` accepts
chapter boundaries as a second argument. `ArrowUp`/`ArrowDown` then jump between
chapters.

Use the slide router for sequences. Use the bound router for everything else.
They are separate tools. You do not layer them.

## Emit a machine-readable channel alongside the page

The route descriptor carries three channels. `page`
renders for people. `cli` shows the terminal equivalent in the command bar.
`graph` emits a machine-readable representation of the same route. That
representation is a Turtle or JSON-LD fragment. An agent can consume it and does
not scrape the HTML.

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

All three channels call the same presenter. So the page a person sees, the
command an agent copies, and the graph fragment a crawler reads never disagree.
`graph` is optional. Routes without it offer no machine channel.

## Verify

- [ ] A `createCard` with an `href` navigates to that hash when you click it.
- [ ] When you type in a `createSearchBar`, the reactive updates and the
      filtered list re-renders.
- [ ] `store.updateState(path, value)` fires every subscriber registered with
      `store.subscribe`.
- [ ] A page handler that throws renders the error boundary's message instead of
      a blank screen.
- [ ] Arrow keys move between slides after you call `setSlideOrder` and
      `startKeyboardNav`.
- [ ] A route with a `graph` function returns a fragment built from the same
      presenter as its `page`.

## What's next

<div class="grid">

<!-- part:card:.. -->

<!-- part:card:../add-capability -->

</div>
