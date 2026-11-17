---
name: ask-me
description: Before building a part of the spec, ask the owner ten conceptual questions that would change the design, then fold the answers into the plan. Use when the owner says "ask me" or a milestone pilot is about to start.
---

# Ask me

Steer a piece of work at the level of ideas before any code exists.

1. Read the spec section being built and its "Open questions", and the
   principles in `docs/decisions.md`.
2. Write ten questions, numbered, each one a decision the owner can make
   and you can't infer from the repo: what a user is trying to do, what
   matters more when two goals conflict, what "done" looks like. No
   implementation trivia, no yes/no questions that the spec already answers.
3. Send them together and wait.
4. Fold the answers into the plan. Where an answer changes the spec, edit
   the spec in the same PR and say so; where it is a decision, add a row to
   `docs/decisions.md`.
