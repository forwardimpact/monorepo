---
name: website
description: Maintain the Forward Impact Team website under docs/. Use when editing website pages, assets, hero images, icons, or the GitHub Actions publish workflow.
---

# Website Skill

## When to Use

- Adding or editing pages on the public website
- Updating hero images, icons, or CSS/JS assets
- Modifying the GitHub Actions publish workflow
- Applying design guidelines to new pages or components

## Site Structure

The website source lives in `docs/` and is built by `libdoc` (see the libdoc
skill for template variables, front matter options, and build mechanics).

```
docs/
├── CNAME                    # Custom domain: www.forwardimpact.team
├── index.template.html      # Shared Mustache template for every page
├── index.md                 # Landing page (layout: home)
├── about/index.md           # Philosophy page (layout: product)
├── map/index.md             # Map product page
├── pathway/index.md         # Pathway product page
├── guide/index.md           # Guide product page
├── basecamp/index.md        # Basecamp product page
├── docs/                    # Technical documentation
│   ├── index.md
│   ├── map/                 # Map docs
│   ├── model/               # Model/libpathway docs
│   ├── pathway/             # Pathway docs
│   └── basecamp/            # Basecamp docs
├── assets/
│   ├── main.css             # Global stylesheet
│   ├── main.js              # Global scripts
│   ├── heros/               # Hero scene illustrations (SVG + JPG)
│   └── icons/               # Product icons (SVG, normal + flat variants)
```

### Layouts

Pages use the `layout` front matter field to control styling:

| Layout    | Use for                                                |
| --------- | ------------------------------------------------------ |
| `home`    | Landing page — full-width, no max-width constraint     |
| `product` | Product pages — 720px max-width, value-box blockquotes |
| _(none)_  | Documentation — 680px max-width prose formatting       |

### Assets Pipeline

Hero illustrations and product icons have **source files** in `design/` and
**deployed copies** in `docs/assets/`:

| Source                | Deployed to               |
| --------------------- | ------------------------- |
| `design/heroes/*.svg` | `docs/assets/heros/*.svg` |
| `design/icons/*.svg`  | `docs/assets/icons/*.svg` |

When updating illustrations, edit the source in `design/` and copy to
`docs/assets/`. Both SVG and JPG versions exist for hero images (JPG as
fallback).

## Design Guidelines

All visual decisions follow `design/SPEC.md`. Key rules for website work:

- **Monochrome palette** — warm-tinted grays, sandstone accent for ambient
  warmth, never color
- **Typography** — Instrument Serif for hero/display headings, DM Sans for
  everything else, DM Mono for code
- **Section rhythm** — alternate white (`#ffffff`) and warm (`#faf9f7`)
  backgrounds
- **Character illustrations** — three characters (Engineer, AI Agent,
  Stakeholder) in monochrome line art; see SPEC.md for scene descriptions and
  rules
- **Design tokens** — use CSS custom properties defined in SPEC.md section 15

Consult `design/SPEC.md` directly for color values, spacing tokens, component
specs, and character guidelines.

## Publishing

The site is published via GitHub Actions in `.github/workflows/website.yaml`:

1. **Trigger**: push to `main` or manual `workflow_dispatch`
2. **Build**: `npx fit-doc build --src=docs --out=dist`
3. **Extra assets**: JSON schema files from `products/map/schema/json/` and RDF
   schema files from `products/map/schema/rdf/` are copied into `dist/schema/`
4. **CNAME**: `docs/CNAME` is copied to `dist/` for the custom domain
5. **Deploy**: uploaded to GitHub Pages via `actions/deploy-pages@v4`

### Local Preview

```sh
npx fit-doc serve --watch    # Live-reload dev server
npx fit-doc build --src=docs --out=dist   # Full production build
```

## Common Tasks

### Add a new page

1. Create `docs/{section}/index.md` with front matter (`title`, `description`,
   `layout` if needed)
2. Add navigation links from related pages
3. Preview with `npx fit-doc serve --watch`

### Update a hero illustration

1. Edit the SVG source in `design/heroes/`
2. Copy to `docs/assets/heros/` (both `.svg` and `.jpg` if applicable)
3. Reference in front matter as `/assets/heros/{name}.svg`

### Add schema files to the published site

Schema files are copied automatically by the workflow. Add new JSON schemas to
`products/map/schema/json/` and RDF schemas to `products/map/schema/rdf/` — they
will appear at `/schema/json/` and `/schema/rdf/` on the live site.
