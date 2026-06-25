---
title: "Getting Started: Pathway for Leaders"
description: "Preview your agent-aligned engineering standard in the browser, generate job definitions, and create interview question sets."
---

Pathway is your interface to the agent-aligned engineering standard — browse
roles, generate job definitions, and preview everything in the browser.

## Prerequisites

- Node.js 22+
- npm
- Standard data initialized via `npx fit-map init` (see
  [Getting Started: Map for Leaders](/docs/getting-started/leaders/map/)
  for the full setup)

## Install

```sh
npm install @forwardimpact/pathway
```

## Preview

Start the development server to see your agent-aligned engineering standard in
the browser:

```sh
npx fit-pathway dev
# Open http://localhost:3000
```

Browse disciplines, levels, and skills to verify everything looks correct.

## Generate job definitions

Generate a complete job definition by combining a discipline, level, and
optional track:

```sh
npx fit-pathway job software-engineering J060 --track=platform
```

## Generate interview questions

Create role-specific interview question sets:

```sh
npx fit-pathway interview software-engineering J060
```

---

## What's next

<div class="grid">

<!-- part:card:../../../../pathway -->
<!-- part:card:../../../products/career-paths -->

</div>
