# Claude

Read [AGENTS.md](AGENTS.md); its rules apply to every session.

- The session-start hook (`.claude/hooks/session-start.sh`) installs
  dependencies in a fresh checkout.
- Skills in `.claude/skills/`: `plant-import` (adding plants with
  provenance), `pdf-plant-list` (fixtures from a plant-list PDF in `docs/`), `ask-me` and `grill-me` (steering and stress-testing a plan).
- Cloud sessions push to their assigned `claude/…` or `ccr-…` branch; its lane comes
  from the paths it changes ([docs/workflow.md](docs/workflow.md#lanes)).
- `npm run build` then `npm run preview` shows the site with the library's
  prototype plants (bannered: they are fixtures). `npm run build:fixtures`
  builds from the tests' made-up library instead.
