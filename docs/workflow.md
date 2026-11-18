# Workflow

## Purpose

How changes reach `main`: every change is a pull request, CI enforces the
rules, and `main` is always complete (P1, P8, P11).

## Behavior

### Lanes

| | Content lane | Dev lane |
|---|---|---|
| Paths | `content/**`, `assets/images/**` | Everything else; content paths only as a migration |
| Branch | `content/<short-description>`; `content/sub-<id>` for a submission | `dev/<short-description>`, `admin/<short-description>` for maintenance such as dependency rounds, `dependabot/` |
| CI checks | `validate`, `build` | Those, then `check` and `test` |
| PR template | `.github/PULL_REQUEST_TEMPLATE/content.md` | `.github/PULL_REQUEST_TEMPLATE/dev.md` |

- A content branch that changes any other path fails.
- A dev PR that touches content paths is a migration and gets the
  `migration` label.
- A dev PR that changes only Markdown outside `content/` runs `check`
  alone.
- `claude/` and `ccr-` branches, as cloud sessions name them, take their
  lane from their paths: content-only changes are the content lane, anything else
  the dev lane.
- `spike/` branches can't merge. Never push to `main`, never rewrite pushed
  history; PRs are squash-merged with the title `<area>: <summary>`.

`npm run lane` runs the check locally against `origin/main`.

### CI

- **`validate.yml`** on every PR: the lane check, then the lane's checks
  (`validate` with the attribution staleness check, `build`, a job summary
  of changed entries with their key facts, `check`, `test`). A PR labelled
  `milestone` also runs `a11y`.
- **`deploy.yml`** on merge to `main`: build, check the built site's links,
  and keep `site/dist` as the `site` artifact for 30 days. A second job
  publishes the fixture build (`npm run build:fixtures`, bannered) to
  GitHub Pages at `/plant-library/`, so the draft can be viewed. Pages must
  be on, with "GitHub Actions" as its source (Settings → Pages).
- **`labeler.yml`** adds area labels by path: `ui`, `data`, `map`, `ci`,
  and `migration`.
- **Dependabot** proposes npm and Actions updates weekly.

Branch protection is a repository setting, checked by hand (Testing
backlog).

### Before a push

Content: `npm run validate`, `npm run build`. Dev: those, then
`npm run check` and `npm test`. The session-start hook runs `npm ci` in a
fresh checkout.

### The prototype and the company copy

This repo is a personal MIT-licensed prototype with no real project data.
`config/site.json` has `fixturesOnly: true`, and validation then fails any
entry of a type with `fixtureRules` (projects and palettes, once built) that
isn't a fixture or fills a proprietary field.

When the prototype is ready it is copied, and the copy's ownership passes to
the company, which turns `fixturesOnly` off, takes real data, and serves the
build from an internal web server. Nothing flows back. Before commercial
use, the copy works through its handover checklist:

- remove the fixture projects and palettes;
- clear or replace everything `npm run coverage` lists as non-commercial;
- set `base` (`/plant-library/` here, for GitHub Pages) and
  `basemap.maxZoom` in `config/site.json` for the internal server;
- remove the Pages job from `deploy.yml`;
- decide the copy's own license notice.

The site depends on no particular host; the server only needs to honor HTTP
range requests (for the basemap). `npm run preview` serves `site/dist` the
same way.

## Where the rules live

`lib/lane.ts` (tested in `tests/lane.test.ts`), `.github/workflows/`,
`.github/labeler.yml`, `config/site.json`, and the fixtures-only block in
`lib/validate.ts`.

## Extending

A new area label is a line in `.github/labeler.yml` and in `areaLabels()` in
`lib/lane.ts`. A new required check is a step in `validate.yml` and an entry
in `checkLane()`.
