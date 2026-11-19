# Routines

## Purpose

The Claude Code routines that work on the repo, with their prompt, run
order, and schedule, so a session with no memory runs them the same way
each time (P11). The one routine so far integrates submissions.

## Behavior

### Integrate submissions

- **Prompt.** "Integrate the submissions in the inbox with the `integrate`
  skill." The skill
  ([`.claude/skills/integrate/SKILL.md`](../.claude/skills/integrate/SKILL.md))
  holds the workflow; the prompt adds nothing to it.
- **Run order.** The inbox oldest first (`npm run inbox -- list`), one
  submission at a time to its close, each with its own `content/sub-<id>`
  branch from the latest `main` and its own PR. A submission that fails
  part way stays in the inbox for the next run; one that is closed is never
  taken again, since `close` moves it and `import` skips an id already
  processed.
- **Output.** One content PR per submission that integrated anything, and a
  `result.json` per submission in `processed/`. It never merges: the owner
  reviews and merges each PR.
- **Schedule.** None in the prototype: the owner is the only contributor,
  imports a bundle, and runs the skill in a session by hand
  ([submissions.md](submissions.md#the-integrate-skill)). Where and how
  often the company copy runs it is decided at handover, with where its
  inbox lives (`spec/v1/submissions.md`, open questions).
- **Checking it.** The fixture inbox, run on a copy as the skill
  describes, then `npm run inbox -- compare`
  ([submissions.md](submissions.md#the-fixture-inbox)).

## Where the rules live

`.claude/skills/integrate/SKILL.md`, `scripts/inbox/index.ts`,
`lib/result.ts`.

## Extending

A new routine is a section here (prompt, run order, output, schedule, how
to check it) and a skill in `.claude/skills/` that holds its workflow.
