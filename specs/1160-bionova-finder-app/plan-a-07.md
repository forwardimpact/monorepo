# Plan 1160-a-07 — Web surface

Build the Next.js App Router web frontend under `products/polaris/site/`,
styled with Tailwind + shadcn/ui, dispatching to shared handlers via
`@forwardimpact/libui`.

All paths are inside `bionova-apps/`. The read-only surfaces source their
patient-facing copy from the terrain-generated prose seed tables (condition
explainers, trial FAQs, consent summaries, site descriptions, patient stories,
therapy descriptions) — no hand-authored text.

## Step 1 — Scaffold Next.js project

Created: `products/polaris/site/` initialized via

```sh
cd products/polaris/site
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

```text
products/polaris/site/
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
  "@bionova/polaris-handlers": "workspace:*",
  "next": "14.2.5",
  "react": "18.3.1",
  "react-dom": "18.3.1"
}
```

Add `output: "standalone"` to `next.config.mjs` so the Dockerfile builds a
minimal runtime image.

Verify: `cd products/polaris/site && bun install && bun run build` exits 0.

## Step 2 — Initialize shadcn/ui

```sh
cd products/polaris/site
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
| `/trials/[id]` | `src/app/trials/[id]/page.tsx` | `showTrial` (also renders the trial FAQ + consent summary from `faq`/`consentSummary` on the result) |
| `/trials/[id]/eligibility` | `src/app/trials/[id]/eligibility/page.tsx` | `checkEligibility` (POST handler in `route.ts`) |
| `/conditions/[id]` | `src/app/conditions/[id]/page.tsx` | `showCondition` (condition + its explainer text from the `condition_explainers` seed table) |
| `/sites` | `src/app/sites/page.tsx` | `listSites` (also renders each site's `description`) |
| `/stories` | `src/app/stories/page.tsx` | `listStories` (patient stories from the `patient_stories` seed table; supports `?condition=` filter) |
| `/about` | `src/app/about/page.tsx` | `showAbout` (also renders therapy descriptions from the `therapies` list) |
| `/admin/trials/[id]` | `src/app/admin/trials/[id]/page.tsx` | `manageTrial` |

JSON variants of every read handler are exposed via sibling Route Handlers
under `src/app/api/`. A Server Component **cannot** legally return a bare
`Response` in Next 14 App Router (it must return a React element), so the
JSON surface lives at a distinct URL path that the smoke script (plan-a-08
SC4) calls. Ordinary browsers continue to hit the page routes; the API
routes are an implementer surface for parity testing and the CLI.

Created (one `route.ts` per read handler, beside `src/app/api/`):

| URL | File | Handler |
| --- | --- | --- |
| `GET /api/search` | `src/app/api/search/route.ts` | `searchTrials` |
| `GET /api/trials/[id]` | `src/app/api/trials/[id]/route.ts` | `showTrial` |
| `GET /api/conditions/[id]` | `src/app/api/conditions/[id]/route.ts` | `showCondition` |
| `GET /api/sites` | `src/app/api/sites/route.ts` | `listSites` |
| `GET /api/stories` | `src/app/api/stories/route.ts` | `listStories` |
| `GET /api/about` | `src/app/api/about/route.ts` | `showAbout` |

Shape of every Route Handler:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { searchTrials } from "@bionova/polaris-handlers";
import { buildCtxFromRequest } from "@/lib/build-ctx";

export async function GET(request: NextRequest) {
  const ctx = buildCtxFromRequest(request);
  const result = await searchTrials(ctx);
  return NextResponse.json(result);
}
```

(`/api/trials/[id]` receives `{ params: { id } }` as the second argument
and threads it into `buildCtxFromRequest(request, { id })`.)

No page Server Component returns a `Response` — the JSON surface and the
HTML surface are distinct routes that share the handler and `buildCtx`.

`src/app/layout.tsx`: imports Tailwind base, wraps children in shadcn
Toaster + a header with nav (Home, Search, Sites, About). Admin pages add
a sidebar.

Each page is a Server Component that:

1. Constructs the `data` context (PostgREST client bound to the request's
   anon/staff JWT)
2. Calls the matching handler
3. Renders via shadcn primitives (NOT libformat HTML, since React already
   renders — libformat HTML output is for non-React contexts)

Created: `src/lib/build-ctx.ts` — three shared bootstraps so pages,
admin pages, and API routes do not duplicate wiring. The staff JWT is
read from the `sb-staff-jwt` cookie (set by GoTrue's email/password
flow); when absent, `ctx.data.token` is `undefined` and `manageTrial`
will throw the documented "manageTrial requires ctx.data.token"
error rather than silently performing an anon PATCH.

```ts
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { freezeInvocationContext } from "@forwardimpact/libui";
import { createDataContext } from "@bionova/polaris-handlers/context";

const STAFF_JWT_COOKIE = "sb-staff-jwt";

function env() {
  return {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    TEI_URL: process.env.TEI_URL!,
  };
}

function collapse(searchParams: Record<string, string | string[] | undefined>) {
  // Next 14 may pass array values when the same key appears multiple times.
  // Handlers expect scalar options; collapse arrays to first value.
  const options: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) {
    if (typeof v === "string") options[k] = v;
    else if (Array.isArray(v) && v.length > 0) options[k] = v[0];
  }
  return options;
}

// Page Server Components (anon read; no staff JWT).
export function buildCtx(
  searchParams: Record<string, string | string[] | undefined>,
  args: Record<string, string> = {},
) {
  return freezeInvocationContext({
    data: createDataContext(env()),
    args,
    options: collapse(searchParams),
  });
}

// Admin page Server Components (staff JWT required — propagated to
// `ctx.data.token` so `manageTrial`'s precondition passes and RLS
// evaluates the staff role).
export function buildAdminCtx(
  searchParams: Record<string, string | string[] | undefined>,
  args: Record<string, string> = {},
) {
  const token = cookies().get(STAFF_JWT_COOKIE)?.value;
  return freezeInvocationContext({
    data: createDataContext(env(), { token }),
    args,
    options: collapse(searchParams),
  });
}

// Route Handlers (`src/app/api/**`). Reads the same staff cookie when
// present so an authenticated browser session can hit `/api/*` with the
// staff role; anon clients get anon-role data. The smoke script calls
// `/api/*` without a cookie, exercising the anon path.
export function buildCtxFromRequest(request: NextRequest, args: Record<string, string> = {}) {
  const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
  const token = request.cookies.get(STAFF_JWT_COOKIE)?.value;
  return freezeInvocationContext({
    data: createDataContext(env(), { token }),
    args,
    options: collapse(searchParams),
  });
}
```

`createDataContext(env, { token })` is the existing handlers entry point
from plan-a-05 — extended in this part to take an optional second
argument that the PostgREST client uses as the `Authorization: Bearer`
header for the bound session.

Example `src/app/search/page.tsx`:

```tsx
import { searchTrials } from "@bionova/polaris-handlers";
import { buildCtx } from "@/lib/build-ctx";
import { TrialCard } from "@/components/trial-card";

export default async function SearchPage({ searchParams }: { searchParams: Record<string, string | string[]> }) {
  const ctx = buildCtx(searchParams);
  const result = await searchTrials(ctx);
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

`src/app/conditions/[id]/page.tsx` follows the same shape with `showCondition`
and `args: { id }`, rendering the condition plus its `explainer` text.
`src/app/stories/page.tsx` follows the search-page shape with `listStories`,
threading `?condition=` through `ctx.options` to render the filtered stories.

Admin page `src/app/admin/trials/[id]/page.tsx` uses `buildAdminCtx`
instead, so `manageTrial` sees the staff JWT and RLS applies the staff
role; the page renders an unauthorized state if the cookie is absent.

Verify: `bun run build` exits 0; `bun run dev` and visiting
`/search?condition=diabetes` renders the diabetes trial list;
`/api/search?condition=diabetes` returns JSON; `/admin/trials/<id>` 200s when
the staff cookie is set and 401-redirects when it is not (success criteria #2 +

## 5)

### Step 4 — Author shared components

Created under `products/polaris/site/src/components/`:

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

### Step 5 — Author `/trials/[id]/eligibility/route.ts`

POST handler that:

1. Receives form data (parsed via `request.formData()`)
2. Builds InvocationContext with `args: { id }`, `options: <answers>`
3. Calls `checkEligibility`
4. Redirects (303) to `/trials/[id]/eligibility?signal=<id>&score=<score>`

Verify: form submission inserts `interest_signals` row and redirects with
score in query string; success criterion #3.

### Step 6 — Dockerfile + healthcheck

Edit `products/polaris/site/Dockerfile`. Compose builds this with
`context: .` (repo root — set in part 01 step 4); all COPY paths below
are repo-root-relative:

```dockerfile
FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN npm install -g bun@1.2
# Copy workspace root metadata first for caching
COPY package.json bun.lockb ./
COPY products/polaris/handlers ./products/polaris/handlers
COPY products/polaris/site ./products/polaris/site
RUN bun install --production=false
RUN cd products/polaris/site && bun run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/products/polaris/site/.next/standalone ./
COPY --from=builder /app/products/polaris/site/.next/static ./products/polaris/site/.next/static
COPY --from=builder /app/products/polaris/site/public ./products/polaris/site/public
EXPOSE 3000
CMD ["node", "products/polaris/site/server.js"]
```

The `bun install` step in the builder stage resolves the `workspace:*`
dep `@bionova/polaris-handlers` because both directories are present
under `/app/`.

Add `src/app/api/health/route.ts`:

```ts
export const GET = () => new Response("ok");
```

(matches the part-01 healthcheck `curl -f http://localhost:3000/api/health`.)

Verify: `docker compose up -d polaris-site` reaches `(healthy)` within 60s;
`curl http://localhost:3001/` returns the homepage HTML.

### Step 7 — Tests

Created: `products/polaris/site/src/__tests__/`:

| Test file | Coverage |
| --- | --- |
| `search.test.tsx` | Server-component renders trial list with mocked handler |
| `trial-detail.test.tsx` | Shows trial fields + sites + conditions |
| `eligibility.test.tsx` | Form submits, score badge renders |
| `sites.test.tsx` | Site filter dropdown updates list |
| `admin-trial.test.tsx` | Requires staff cookie; redirects to `/login` if absent |

Test runner: `vitest` (added to devDeps) with `@testing-library/react`.

Verify: `cd products/polaris/site && bun run test` exits 0.

### Step 8 — Open part-07 PR

```sh
git checkout -b products/polaris-site
git add products/polaris/site/
git commit -m "products: bionova-polaris web (Next.js + Tailwind + shadcn)"
git push -u origin products/polaris-site
gh pr create --title "products: bionova-polaris web (Next.js + Tailwind + shadcn)" --body "Implements plan-a-07 of spec 1160. App Router dispatches to shared handlers; admin routes gated by staff JWT in Supabase cookie."
```

Verify: PR CI green (lint + build + vitest); preview link (if Vercel
preview enabled, else local Docker compose smoke documented).

### Verification (end of part 07)

- [ ] `bun run build` in `products/polaris/site/` exits 0.
- [ ] All 9 routes render without runtime errors (manual against `bun run dev`).
- [ ] `/search?condition=high+blood+sugar` returns diabetes-related trials
      (success criterion #2).
- [ ] `/trials/[id]` shows the trial FAQ and consent summary.
- [ ] `/conditions/<id>` shows the condition explainer.
- [ ] `/stories` lists patient stories; `/stories?condition=<id>` filters them.
- [ ] `/trials/[id]/eligibility` form submits to route handler, inserts interest
      signal, shows score badge (success criterion #3).
- [ ] `/sites?specialty=oncology` filters site list and shows each site's
      description.
- [ ] `/admin/trials/[id]` returns 401 without staff JWT; returns admin view
      with signal aggregates with staff JWT.
- [ ] `vitest run` exits 0.
- [ ] `docker compose up -d polaris-site` reaches `(healthy)` within 60s.

— Staff Engineer 🛠️
