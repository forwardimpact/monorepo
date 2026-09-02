# Plan Part 04 — CLI and Web Surfaces, with the Visual Token Layer

Build the `bionova-polaris` CLI under `products/polaris/cli/` and the
Next.js site under `products/polaris/site/`. Both dispatch into the
part-03 handlers. All paths are relative to the `bionova-apps/` repo
root.

## CLI

The CLI defines nine commands over `libcli`. Every read command accepts a
`--json` flag that emits raw handler data instead of templated ANSI
output; the smoke script uses it for surface parity.

| Command | Args and options | Handler |
| --- | --- | --- |
| `search` | `--condition`, `--phase`, `--status`, `--location` | `searchTrials` |
| `trial <id>` | positional id | `showTrial` |
| `condition <id>` | positional id | `showCondition` |
| `eligibility <id>` | positional id plus screener answers | `checkEligibility` |
| `sites` | `--specialty` | `listSites` |
| `stories` | `--condition` | `listStories` |
| `about` | none | `showAbout` |
| `admin trial <id>` | positional id, `--update` JSON patch | `manageTrial` |
| `repl` | none | interactive session |

Admin auth: the staff JWT comes from `--token` or the
`SUPABASE_SERVICE_ROLE_KEY` environment variable.

REPL conventions, per the shipped REPL:

- Commands are slash-prefixed (`/search`, `/trial`); bare input falls
  through to the line handler.
- `librepl` writes a command's output only when the handler returns a
  Readable, so each formatted string is wrapped in one.
- A trial command accepts an index into the last search results or a
  literal id.

## Web

Pages are Server Components that call the shared handlers. The JSON
surface lives at distinct `/api/*` paths, because a Server Component
returns a React element, not a `Response`. The routes:

| Surface | Routes |
| --- | --- |
| Nine pages | `/`, `/about`, `/search`, `/sites`, `/stories`, `/trials/[id]`, `/trials/[id]/eligibility`, `/conditions/[id]`, `/admin/trials/[id]` |
| Six JSON routes | `/api/search`, `/api/trials/[id]`, `/api/conditions/[id]`, `/api/sites`, `/api/stories`, `/api/about` |
| Health | `/api/health` |

Three context bootstraps keep the setup in one place:

- **Page**: anon read; freezes the context from the page's search
  params.
- **Admin**: reads the staff JWT from the staff cookie and threads it
  into the data context, so `manageTrial`'s token precondition passes
  and RLS evaluates the staff role. The admin page renders an
  unauthorized state when the cookie is absent.
- **Request**: for the `/api/*` handlers; reads the same cookie when
  present, so anon clients get anon-role data.

The eligibility form posts to a submit route that calls
`checkEligibility` and redirects with the result.

Standalone build: C7 governs the Dockerfile and the bundled runtime
(tracing root, the about-file path override, plain install).

## Library placement

- `libcli` and `librepl` in the CLI; `libformat` renders the CLI's
  templated markdown to ANSI.
- `libui` in the site.
- `libutil` pinned from npm in the Polaris CLI manifest.
- Styling is hand-rolled Tailwind components. The component library
  stays an implementation choice; the token contract below is the
  requirement.

## Visual token layer

Apply all six groups of the design § Visual token contract:

1. Semantic surface colors as CSS variables with light and dark values.
2. The status mapping, with a human label for every status. No raw
   status enum reaches a patient surface.
3. A type scale of at least three steps on every page.
4. One spacing scale and one radius scale; no ad-hoc pixel values.
5. WCAG AA contrast in both themes.
6. The 390 px responsive floor: no horizontal scroll, usable navigation.

## Verification

- Each library's entry symbol is imported by its consuming unit.
- An admin upload through Kong lands in the `trial-documents` bucket.
- The five visual outcomes from spec § Visual outcomes, checked on the
  running site. They are **not yet met by the shipped repository**; the
  token layer above is the rebuild step that meets them.

— Staff Engineer 🛠️
