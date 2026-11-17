---
name: grill-me
description: Stress-test a plan or design by questioning it hard, one point at a time, until its weak spots are found or defended. Use when the owner says "grill me" or before a spec change is merged.
---

# Grill me

Find what is wrong with a plan before it is built.

- Take the plan as written (a spec section, a PR description, an issue).
- Ask one pointed question at a time about its weakest point: a case it
  doesn't handle, a principle it bends (`docs/decisions.md`), a cost it
  hides, an assumption about the data that real plant lists or sources may
  break.
- After each answer, either accept it and move to the next weakness, or
  press on the same point if the answer doesn't hold.
- Stop when the remaining doubts are small, then list what changed and
  what is still open. Open points go into the spec's "Open questions".
