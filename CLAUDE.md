# Claude

Read [AGENTS.md](AGENTS.md); its rules apply to every session.

- The session-start hook (`.claude/hooks/session-start.sh`) installs
  dependencies in a fresh checkout.
- Skills in `.claude/skills/`: `plant-import` (adding plants with
  provenance), `ask-me` and `grill-me` (steering and stress-testing a plan).
- Cloud sessions push to their assigned `claude/…` or `ccr-…` branch; its lane comes
  from the paths it changes ([docs/workflow.md](docs/workflow.md#lanes)).
- To see the site with data before the real fixture set exists, use
  `npm run build:fixtures` then `npm run preview`; those pages carry a
  banner, and their values are not sourced facts.
