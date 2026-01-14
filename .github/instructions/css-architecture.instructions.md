---
applyTo: "**/*.css"
---

# CSS Architecture

## Layer Order

The application uses CSS `@layer` for predictable cascade control. Layers are
declared in order of increasing specificity:

```
tokens → reset → base → components → utilities → pages → slides → handout → print
```

| Layer        | Purpose                               | Files                          |
| ------------ | ------------------------------------- | ------------------------------ |
| `tokens`     | Design tokens (CSS custom properties) | `css/tokens.css`               |
| `reset`      | Browser normalization                 | `css/reset.css`                |
| `base`       | Typography, body defaults             | `css/base.css`                 |
| `components` | Reusable UI components                | `css/components/*.css`         |
| `utilities`  | Spacing, layout helpers               | `css/components/utilities.css` |
| `pages`      | Page-specific styles                  | `css/pages/*.css`              |
| `slides`     | Slide view styles                     | `css/views/slide-*.css`        |
| `handout`    | Handout view overrides                | `css/views/handout.css`        |
| `print`      | Print media queries                   | `css/views/print.css`          |

## Directory Structure

```
app/css/
├── tokens.css          # Design tokens (colors, spacing, typography)
├── reset.css           # Browser reset
├── base.css            # Base typography and links
├── components/         # Reusable components
│   ├── layout.css      # Stack, flex, grid utilities
│   ├── surfaces.css    # Cards, sections, page headers
│   ├── typography.css  # Labels, text utilities
│   ├── badges.css      # All badge variants
│   ├── buttons.css     # Button styles
│   ├── forms.css       # Form inputs, selects
│   ├── tables.css      # Table variants
│   ├── progress.css    # Level dots, progress bars
│   ├── nav.css         # Navigation component
│   ├── states.css      # Loading, error, empty states
│   └── utilities.css   # Margin utilities
├── pages/              # Page-specific styles
│   ├── landing.css
│   ├── job-builder.css
│   ├── agent-builder.css
│   ├── lifecycle.css
│   ├── detail.css
│   ├── interview-builder.css
│   ├── self-assessment.css
│   ├── assessment-results.css
│   └── progress-builder.css
├── views/              # View-specific styles (slides, print)
│   ├── slide-animations.css
│   ├── slide-base.css
│   ├── slide-sections.css
│   ├── slide-tables.css
│   ├── handout.css
│   └── print.css
└── bundles/            # Entry points for HTML files
    ├── app.css         # Main web app (index.html)
    ├── slides.css      # Slide view (slides.html)
    └── handout.css     # Handout view (handout.html)
```

## Bundle Files

Each HTML file imports a single bundle. Bundles declare layer order and import
all required CSS files:

- **app.css** → `index.html` (web application)
- **slides.css** → `slides.html` (slide presentation view)
- **handout.css** → `handout.html` (printable handout view)

## File Conventions

### File Headers

Every CSS file starts with a JSDoc-style comment:

```css
/**
 * Component Name
 *
 * Brief description of what styles this file contains.
 */
```

### Layer Wrapping

All styles must be wrapped in the appropriate `@layer`:

```css
@layer components {
  .my-component {
    /* styles */
  }
}
```

### File Size Target

Aim for files under 300 lines. If a file grows larger, consider splitting by
concern (e.g., `slide-base.css` vs `slide-sections.css`).

## Adding New Styles

### New Component

1. Create `css/components/{component}.css`
2. Wrap in `@layer components { ... }`
3. Add `@import` to `css/bundles/app.css`

### New Page

1. Create `css/pages/{page}.css`
2. Wrap in `@layer pages { ... }`
3. Add `@import` to `css/bundles/app.css`

### Slide-Specific Styles

1. Add to appropriate file in `css/views/slide-*.css`
2. Use `@layer slides { ... }`
3. Already imported by `css/bundles/slides.css`

### Print Styles

1. Add to `css/views/print.css`
2. Use `@layer print { @media print { ... } }`

## Design Tokens

All colors, spacing, and typography values come from `css/tokens.css`. Never use
hardcoded values—always reference tokens:

```css
/* ✅ Good */
.card {
  padding: var(--space-md);
  background: var(--color-surface);
}

/* ❌ Bad */
.card {
  padding: 16px;
  background: #ffffff;
}
```

## Consolidation Rules

To prevent duplication:

1. **Badges** → All badge variants in `badges.css` (level-badge, modifier, tag)
2. **Labels** → Single `.label` definition in `typography.css`
3. **Level dots** → All level indicators in `progress.css`
4. **Tables** → All table variants in `tables.css`
5. **Animations** → All `@keyframes` in `slide-animations.css`
