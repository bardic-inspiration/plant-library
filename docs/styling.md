# Styling

## Purpose

A white ground, thin black lines, vibrant accents, and Montserrat, tuned
through tokens and checked automatically (P9).

## Behavior

- **Direction.** Structure from 1px black rules, square corners, no
  shadows or gradients. Headings heavy; labels small, uppercase, and
  letter-spaced. Botanical names follow the naming rule
  ([content-model.md](content-model.md#plant)). Plant photographs are the
  color on most pages.
- **Color.** One light palette. Text is black on white; accents are for
  rules, marks, and fills. Eight accent hues, each at least 3:1 against
  white, map to plant forms and project types through `data-form` and
  `data-project-type`; bloom colors have fixed swatches through
  `data-bloom`, always inside a black frame. A vermillion tint scale steps
  from white for choropleths.
- **System.** Plain CSS with custom properties and cascade layers
  (`reset, tokens, base, components, utilities`). Component styles are
  scoped in their Astro files; the island's are in `library.css` beside it;
  shared components' are in `components/ui/ui.css`.

| File | Holds |
|---|---|
| `site/src/styles/tokens/primitives.css` | Palette, fonts, type scale, spacing, lines, sizes, durations |
| `tokens/semantic.css` | Roles: background, text, rule, accent, focus, type, space, borders |
| `tokens/components.css` | Card, grid, table, strip, and gallery knobs; breakpoints for reference |
| `tokens/content.css` | Form and project-type accents, bloom swatches, choropleth steps |
| `tokens/print.css` | Print sizing |

### Checks

- **Stylelint** (`.stylelintrc.json`, run by `npm run check` over CSS and
  Astro files) fails a hex or named color, a color function, a length or
  duration unit, or a literal font family outside `tokens/`. Media queries
  may use `rem` widths, since custom properties can't be used there.
- **Contrast** (`tests/styles.test.ts`, `lib/contrast.ts`) reads the token
  files and checks text pairs at 4.5:1; rules, focus, and every form and
  project-type accent at 3:1 against white; every bloom swatch at 3:1
  against the white ground or its black frame; and black text on every
  choropleth step.
- **Accessibility:** `npm run a11y` runs axe on the Library (plain and
  filtered), a plant page, About, and the style guide, at 1280 and 360 px,
  and fails on serious or critical violations. Every icon and color has a
  text label, focus is a visible 3px ring, durations drop to 0 under
  reduced motion, and tables scroll in their own box.

## Where the rules live

The token files, `.stylelintrc.json`, `tests/styles.test.ts`, and
`scripts/a11y.ts`.

## Extending

Add a token to the right file, then use it. A new form or project type
needs a rule in `content.css`; the contrast test fails until it has one.
Check a change on `/styleguide/` and with `npm run snapshots`.
