---
name: plan-sync
description: Keep docs/feature-plan.md in step with the design talk and with what is built - record the user's decisions and answers, keep suggestions labelled, close or add open questions, remove shipped features and move the roadmap on. Use after the user answers design questions or asks for something new, and when a release is finished.
argument-hint: '[decisions | new feature | shipped <release>]'
---

# Syncing the feature plan

The plan is `docs/feature-plan.md`. The user reads it themselves, so it must say exactly what was decided, in plain words.

## Layout

1. Title and `Last updated: YYYY-MM-DD`.
2. **Overview**: what shipped in which game version and save format, what comes next, and which sections are decided.
3. One section per feature, in roadmap order. A decided feature starts with "Decided: …". A proposed one starts with `> **Suggestion, not decided.** …`. Inside a decided section, a proposal of mine is marked "suggested:" or put in its own `> **Suggestion, not decided:** …` block.
4. **Events System**.
5. **Roadmap**: the release table (Release, Game version, Save format, Contents), "Why this order", "Testing each release".
6. **Open questions**: a `- [ ]` list.

## Recording decisions

- Write the user's numbers and names exactly as given. When an answer fixes a typo of theirs, write the corrected version.
- Once the user answers a question, put the answer into the feature's section and delete the question from Open questions. The plan keeps no "answered" items.
- When the user accepts a suggestion, remove its "suggested:" or "Suggestion, not decided" label.
- My own proposals always carry a suggestion label, and they never decide an item, action, building, object, recipe or number (CLAUDE.md, "No invented content").
- When a decision changes how something works today, say what it replaces ("This replaces today's sleep, which gives 11 energy per hour…").
- When an answer contradicts itself or another decision, do not pick a reading: quote it in Open questions and ask.
- When a decision has a consequence the user may not have seen (an exploit, a dead end, a balance problem), raise it in Open questions with a recommendation. The `balance-sim` agent can put numbers on it.

## A new feature

Add its section where the user wants it in the order, add or shift its Roadmap row (each release adds one game minor version and, if it changes saves, one save format), update "Why this order" and the Overview, and list what is still missing as Open questions.

## A shipped release

- Remove the feature's section, its Roadmap row and any Open questions about it.
- Overview: add the release to the sentence on what shipped (game version and save format).
- Roadmap intro: start from the new current version and save format.

The README is where shipped rules live from then on.

## Editing safely

- Prefer the Edit tool with exact strings. For larger scripted edits, write a node script to a file under the OS temp directory and run it; bash heredocs with nested quotes break.
- Never write escaped backticks (`` \` ``) into the file. After editing, the file must contain no backslash at all: search it with the Grep tool for the regex `\\` and expect no match (in bash, `grep '\\'` fails with "Trailing backslash"; use `grep -F '\'` there).
- When replacing a table row by its first cell, include enough of the row to be unique; the same label (for example "Farming") can appear in several tables.
- Update `Last updated` to today.
- Run `npx prettier --write docs/feature-plan.md`, then `npm run format:check`.

## Report

Say what changed in the plan in a few bullets, then list the open questions that still block the next release.
