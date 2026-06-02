# Plan 1160-a-07 — Web surface

Build the Next.js App Router web frontend under `products/finder/site/`,
styled with Tailwind + shadcn/ui, dispatching to shared handlers via
`@forwardimpact/libui`.

All paths are inside `bionova-apps/`.

## Step 1 — Scaffold Next.js project

Created: `products/finder/site/` initialized via

```sh
cd products/finder/site
npx create-next-app@14.2 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git
# create-next-app@14.2 does not document --use-bun; let npm scaffold, then
# regenerate the lockfile under bun at workspace root:
rm -f package-lock.json
cd "$(git rev-parse --show-toplevel)" && bun install
```

If `create-next-app`'s flag surface has shifted at implementation time
(check `npx create-next-app@14.2 --help`), follow the published prompts
for `TypeScript=Yes`, `ESLint=Yes`, `Tailwind=Yes`, `src/=Yes`,
`App Router=Yes`, `import alias=@/*`; document the chosen answers in the
part-07 PR description.

Resulting layout:

```
products/finder/site/
  src/app/
  public/
  next.config.mjs
  tsconfig.json
  package.json
  tailwind.config.ts
  postcss.config.mjs
```

Edit `package.json` to add workspace deps:

```json
"dependencies": {
  "@forwardimpact/libui": "1.2.1",
  "@forwardimpact/libformat": "0.1.15",
  "@bionova/finder-handlers": "workspace:*",
  "next": "14.2.5",
  "react": "18.3.1",
  "react-dom": "18.3.1"
}
```

Add `output: "standalone"` to `next.config.mjs` so the Dockerfile builds a
minimal runtime image.

Verify: `cd products/finder/site && bun install && bun run build` exits 0.

## Step 2 — Initialize shadcn/ui

```sh
cd products/finder/site
npx shadcn@latest init
```

shadcn init is interactive at current versions; expected answers:

| Prompt | Answer |
| --- | --- |
| Style | `default` |
| Base color | `slate` |
| CSS variables | `Yes` |
| `components.json` location | repo default (`./components.json`) |
| Components directory | `@/components` (matches the `src/` layout) |

Add core components used across routes:

```sh
npx shadcn@latest add button card input badge dialog form label select textarea table toast
```

Document any prompt divergence (e.g., the rebrand from `shadcn-ui` to
`shadcn`) in the part-07 PR description.

Verify: `src/components/ui/` populated with shadcn components; `bun run
build` still exits 0.

## Step 3 — Author routes

Created (one `page.tsx` per route + `layout.tsx`):

| Route | File | Handler |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | hero + search form (no handler) |
| `/search` | `src/app/search/page.tsx` | `searchTrials` |
| `/trials/[id]` | `src/app/trials/[id]/page.tsx` | `showTrial` |
| `/trials/[id]/eligibility` | `src/app/trials/[id]/eligibility/page.tsx` | `checkEligibility` (POST handler in `route.ts`) |
| `/sites` | `src/app/sites/page.tsx` | `listSites` |
| `/about` | `src/app/about/page.tsx` | `showAbout` |
| `/admin/trials/[id]` | `src/app/admin/trials/[id]/page.tsx` | `manageTrial` |

All read pages also respond to `?format=json` by serializing the handler
result and returning it as `application/json`. This is implemented in
each Server Component as:

```tsx
if (searchParams.format === "json") {
  const result = await searchTrials(ctx);
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
}
```

The format-json branch is used by the smoke script (plan-a-08 SC4) to
compare web vs CLI without parsing rendered HTML. It is NOT used by
ordinary browsers.

`src/app/layout.tsx`: imports Tailwind base, wraps children in shadcn
Toaster + a header with nav (Home, Search, Sites, About). Admin pages add
a sidebar.

Each page is a Server Component that:
1. Constructs the `data` context (PostgREST client bound to the request's
   anon/staff JWT)
2. Calls the matching handler
3. Renders via shadcn primitives (NOT libformat HTML, since React already
   renders — libformat HTML output is for non-React contexts)

Created: `src/lib/build-ctx.ts` — shared bootstrap so each page does not
duplicate the six-line wiring:

```ts
import { freezeInvocationContext } from "@forwardimpact/libui";
import { createDataContext } from "@bionova/finder-handlers/context";

export function buildCtx(searchParams: Record<string, string | string[] | undefined>, args: Record<string, string> = {}) {
  // Next 14 may pass array values when the same key appears multiple times.
  // Handlers expect scalar options; collapse arrays to first value.
  const options: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") options[k] = v;
    else if (Array.isArray(v) && v.length > 0) options[k] = v[0];
  }
  const env = {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    TEI_URL: process.env.TEI_URL!,
  };
  return freezeInvocationContext({ data: createDataContext(env), args, options });
}
```

Example `src/app/search/page.tsx`:

```tsx
import { searchTrials } from "@bionova/finder-handlers";
import { buildCtx } from "@/lib/build-ctx";
import { TrialCard } from "@/components/trial-card";

export default async function SearchPage({ searchParams }: { searchParams: Record<string, string | string[]> }) {
  const ctx = buildCtx(searchParams);
  const result = await searchTrials(ctx);

  if (searchParams.format === "json") {
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  }

  return (
    <main>
      <h1>Trial search</h1>
      <SearchForm initialValues={ctx.options} />
      <ul>
        {result.trials.map(t => <TrialCard key={t.id} trial={t} />)}
      </ul>
    </main>
  );
}
```

Verify: `bun run build` exits 0; `bun run dev` and visiting `/search?condition=diabetes`
renders the diabetes trial list (success criterion #2).

## Step 4 — Author shared components

Created under `products/finder/site/src/components/`:

| Component | File | Purpose |
| --- | --- | --- |
| `TrialCard` | `trial-card.tsx` | shadcn `Card` with trial summary, link to `/trials/[id]` |
| `SearchForm` | `search-form.tsx` | shadcn `Input` + `Select` filters; client component |
| `EligibilityScreener` | `eligibility-screener.tsx` | shadcn `Form` rendering questions from `criteria.custom[]`; POSTs to `/trials/[id]/eligibility` (App Router handler — no `.ts` extension in URL) |
| `SiteList` | `site-list.tsx` | shadcn `Table` of sites |
| `MatchScoreBadge` | `match-score-badge.tsx` | colored `Badge` per score |
| `Nav` | `nav.tsx` | top header |
| `AdminSidebar` | `admin-sidebar.tsx` | admin nav |
| `InterestSignalSummary` | `interest-signal-summary.tsx` | aggregate counts panel for admin |

Each component is self-contained; styling via Tailwind + shadcn primitives
only (no global CSS beyond `src/app/globals.css` from create-next-app).

Verify: `bun run lint && bun run build` exits 0 with no Tailwind purge
warnings.

## Step 5 — Author `/trials/[id]/eligibility/route.ts`

POST handler that:
1. Receives form data (parsed via `request.formData()`)
2. Builds InvocationContext with `args: { id }`, `options: <answers>`
3. Calls `checkEligibility`
4. Redirects (303) to `/trials/[id]/eligibility?signal=<id>&score=<score>`

Verify: form submission inserts `interest_signals` row and redirects with
score in query string; success criterion #3.

## Step 6 — Dockerfile + healthcheck

Edit `products/finder/site/Dockerfile`. Compose builds this with
`context: .` (repo root — set in part 01 step 4); all COPY paths below
are repo-root-relative:

```dockerfile
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN npm install -g bun@1.2
# Copy workspace root metadata first for caching
COPY package.json bun.lockb ./
COPY products/finder/handlers ./products/finder/handlers
COPY products/finder/site ./products/finder/site
RUN bun install --production=false
RUN cd products/finder/site && bun run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/products/finder/site/.next/standalone ./
COPY --from=builder /app/products/finder/site/.next/static ./products/finder/site/.next/static
COPY --from=builder /app/products/finder/site/public ./products/finder/site/public
EXPOSE 3000
CMD ["node", "products/finder/site/server.js"]
```

The `bun install` step in the builder stage resolves the `workspace:*`
dep `@bionova/finder-handlers` because both directories are present
under `/app/`.

Add `src/app/api/health/route.ts`:

```ts
export const GET = () => new Response("ok");
```

(matches the part-01 healthcheck `curl -f http://localhost:3000/api/health`.)

Verify: `docker compose up -d finder-site` reaches `(healthy)` within 60s;
`curl http://localhost:3001/` returns the homepage HTML.

## Step 7 — Tests

Created: `products/finder/site/src/__tests__/`:

| Test file | Coverage |
| --- | --- |
| `search.test.tsx` | Server-component renders trial list with mocked handler |
| `trial-detail.test.tsx` | Shows trial fields + sites + conditions |
| `eligibility.test.tsx` | Form submits, score badge renders |
| `sites.test.tsx` | Site filter dropdown updates list |
| `admin-trial.test.tsx` | Requires staff cookie; redirects to `/login` if absent |

Test runner: `vitest` (added to devDeps) with `@testing-library/react`.

Verify: `cd products/finder/site && bun run test` exits 0.

## Step 8 — Open part-07 PR

```sh
git checkout -b products/finder-site
git add products/finder/site/
git commit -m "products: bionova-finder web (Next.js + Tailwind + shadcn)"
git push -u origin products/finder-site
gh pr create --title "products: bionova-finder web (Next.js + Tailwind + shadcn)" --body "Implements plan-a-07 of spec 1160. App Router dispatches to shared handlers; admin routes gated by staff JWT in Supabase cookie."
```

Verify: PR CI green (lint + build + vitest); preview link (if Vercel
preview enabled, else local Docker compose smoke documented).

## Verification (end of part 07)

- [ ] `bun run build` in `products/finder/site/` exits 0.
- [ ] All 7 routes render without runtime errors (manual against `bun run dev`).
- [ ] `/search?condition=high+blood+sugar` returns diabetes-related trials (success criterion #2).
- [ ] `/trials/[id]/eligibility` form submits to route handler, inserts interest signal, shows score badge (success criterion #3).
- [ ] `/sites?specialty=oncology` filters site list.
- [ ] `/admin/trials/[id]` returns 401 without staff JWT; returns admin view with signal aggregates with staff JWT.
- [ ] `vitest run` exits 0.
- [ ] `docker compose up -d finder-site` reaches `(healthy)` within 60s.

— Staff Engineer 🛠️
