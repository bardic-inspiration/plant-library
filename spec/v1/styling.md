---
depends: [repo]
---

# Styling

## Goal

A clean, modern, designed look: something at home on the wall of a Seattle
coffee shop. White ground, thin black lines, vibrant accents, a geometric
sans-serif. It is tuned through tokens and checked automatically (P9).

## Design

### Visual direction

- **Ground and line.** White background. Structure comes from 1px black
  rules and borders, not from shadows, gradients, or filled panels. Corners
  are square.
- **Space.** A strict grid and generous whitespace. Cards are bordered
  rectangles with the photograph doing the work.
- **Type.** Montserrat (OFL), self-hosted through `@fontsource`. Headings in
  a heavy weight; labels and badges small, uppercase, and letter-spaced;
  body at regular weight. Botanical names are italic by the naming rule in
  [data-model.md](data-model.md#plant), with cultivar names upright in
  single quotes. If Montserrat's width hurts dense tables, the data face may
  be swapped through a token; nothing else changes.
- **Photography first.** Plant images are the color on most pages. Where a
  plant has no image, the card shows no placeholder and closes up.
- **Icons.** A few Lucide icons, inlined, in `currentColor`: sun, part
  shade, shade, moisture levels, and controls. Each has a text label.
- **Data graphics** (bloom calendars, compatibility grids, legends,
  choropleths) follow the same rules: thin black frame, flat accent fills.

### Color

- **One palette, light only.** No dark theme and no theme switch.
- **Text is black on white.** Accents are for fills, rules, marks, and map
  layers, with black text on or beside them. This keeps vibrant colors
  without failing contrast: an accent is never the color of body text on
  white.
- **Accents carry meaning.** One per plant form (tree, shrub, perennial, and
  so on), one per project type, and a fixed swatch per bloom color. Elements
  carry `data-form` or `data-project-type`, and one rule maps each to
  `--accent`. A value with no variable falls back to the site accent.
- **Sequential scales** for choropleths are tokens too, stepping from white
  to one accent.

The palette itself is chosen in the styling pilot against the style guide
page: five to eight saturated hues that stay distinct from one another, for
readers with color vision deficiency as well, and that hold 3:1 against
white as marks.

### System

As TL: plain CSS with custom properties, nesting, cascade layers, and
container queries; component styles scoped in their Astro components; island
styles in one stylesheet beside the island.

| File | Holds |
|---|---|
| `tokens/primitives.css` | Palette, font families, type scale, spacing, line weights, durations |
| `tokens/semantic.css` | Roles mapped to primitives: background, text, rule, accent, focus |
| `tokens/components.css` | Per-component knobs: card width, grid gap, table density, breakpoints |
| `tokens/content.css` | Data-driven colors: forms, project types, bloom colors, choropleth scales |
| `tokens/print.css` | Print sizing |

Components use only semantic, component, and content tokens. Stylelint fails
a literal color, length, font, or duration outside `tokens/`.

**The map shares the tokens.** A build step writes the MapLibre style
document from the token files, so the basemap's line weights and the
overlays' fills change with the tokens and can't drift from the site
([map.md](map.md#basemap)).

The `/styleguide/` page shows every component in every state, including the
map with each overlay, for refinement and for snapshot captures.

### Accessibility

Target: WCAG 2.2 AA.

- A contrast test parses the token files and checks text pairs at 4.5:1 and
  marks, borders, focus rings, and every accent against white at 3:1.
- Color is never the only signal: every badge, icon, grid cell, and legend
  entry has a text label, and map marks differ by shape or fill as well as
  hue.
- Everything is operable by keyboard with a visible focus ring. The map's
  controls and region picking have keyboard equivalents, and anything the
  map shows is also available in the list view and the results panel.
- Motion uses duration tokens that become `0ms` under reduced motion; map
  fly-to animations are skipped.
- Layouts reflow at 320 CSS px and 200% zoom. Tables scroll in their own
  box.
- `npm run a11y` runs axe through Playwright on the built site and fails on
  serious or critical violations.

## Done when

- The token files exist, Stylelint rejects literals, and a test proves each
  rule fires.
- The contrast test passes for every declared pair, including every form,
  project type, and bloom color.
- The style guide page renders every component state and passes `a11y`.
- The generated map style is rebuilt from tokens in the build, and a test
  fails if a map color isn't a token.

## Out of scope

A dark theme, per-firm branding, and custom illustration.
