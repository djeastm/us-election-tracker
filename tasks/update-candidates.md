# Update run: candidates and the race

You are running a scheduled update of 2028 Watch, a static tracker for the 2028 US presidential election. This run covers the Candidates section: who is running, where they stand on the issues, how they are doing in the polls, and what they have done lately.

Read `CLAUDE.md` in the repo root before doing anything else. It defines the data contract and the rules for update runs, and it overrides anything here that seems to conflict with it.

## Goal

Bring `data/candidates.json`, `data/issues.json` and the race summary in `data/meta.json` up to date since `meta.lastUpdated`. Specifically:

- Declarations and status changes. `status` is one of declared, exploring, interested, undecided, speculated, declined. Update `statusNote` to one sentence on what they last said about running.
- New or changed positions on the issues in `data/issues.json`.
- `standing`, from current polling averages.
- `moves`: notable things a candidate did (a speech, a trip to an early state, a staff hire, a PAC launch, a fight with a rival).
- New candidates, when they qualify (see below).
- A new issue, only when one has become central to the race.
- `meta.raceSummary`, when the shape of the race has changed.

A run that makes a handful of well-sourced changes is a good run. Do not pad it with weak items. A run that finds nothing new is also fine.

## Research procedure

1. Note the date of the last update (`meta.lastUpdated`) and focus on what happened after it.
2. Check these starting points:
   - Wikipedia: "2028 United States presidential election", "2028 Republican Party presidential primaries" and "2028 Democratic Party presidential primaries". Use these to find events and their cited sources, then cite the underlying reporting rather than Wikipedia where possible.
   - RealClearPolling, for the national primary averages of each party.
   - Political coverage from Reuters, AP, NBC News, CNN and Fox News.
   - The candidates' own statements: campaign or PAC sites, official sites, posts on X, interviews.
3. Search each tracked candidate's name with "2028", and the issue names in `issues.json` with the candidate's name.
4. Search for "2028 presidential" plus "announces", "exploratory committee", "will not run", and the names of anyone polling near the threshold.
5. For each finding, get to the primary record or a mainstream report that quotes it directly.

## Sourcing rules

- Never invent a quote, a number or a position. If it cannot be sourced, leave it out.
- Prefer primary reporting. When the only source is partisan or a single thin report, say so in the `summary` or `text`.
- Use neutral language for every candidate, whatever their politics.
- Every position, history entry and move has at least one source with title, publisher, https url and date.

## How to edit the files

`data/candidates.json`:

- **Status.** Change `status` only on clear evidence (a filing, an announcement, an on-record statement). Add a `moves` entry for the change.
- **Positions.** Positions keep their history. When a candidate's position on an issue changes, first copy the current `label`, `lean`, a short `note` and its `sources` into a new entry at the top of that position's `history` (with the old `asOf` as its `date`), then write the new `label` (six words or fewer), `lean`, `summary`, `asOf`, `basis` and `sources`. Never overwrite a position without moving the old one into `history`.
- `lean` runs from -2 (the issue's `low` end) to 2 (its `high` end), or `null` when the position does not fit the scale. It is an editorial judgment; change it only when the evidence changes, and explain why in `summary`.
- `basis` is `statement` (they said it), `record` (votes, actions in office) or `reported` (others report it).
- If nothing is on record for an issue, leave that issue out of `positions`. Do not guess.
- **Standing.** Replace `standing` with the latest polling average, for example "21.4% in the RealClearPolling Democratic average, second", with `asOf` set to the date of the average and a source. Use `null` only when no reputable average includes them.
- **Moves.** Add new moves at the top of `moves` (newest first). One or two sentences each.

`data/issues.json`:

- Add a new issue only when it has become central to the race, meaning several candidates are regularly asked about it and are taking different positions. Give it a kebab-case `id`, a short `name`, a `question`, and `low` and `high` labels for the two ends of its scale. Then add positions for the candidates who have a sourced position on it. Never remove or rename an existing issue id.

## Adding a candidate

Add someone when any of these is true: they have declared, they have formed an exploratory committee, or they are polling at about 3% or more in a reputable average (RealClearPolling or similar).

For a new candidate:

1. Choose an id: their name in lowercase kebab-case (`firstname-lastname`). Ids never change once published.
2. Set `wikipedia` to the exact English Wikipedia page title. Check that the page exists.
3. Set `portrait` to `null`.
4. Fill every field in the contract: `party`, `role`, `born`, `home`, `status`, `statusNote`, `bio` (two or three neutral sentences), `standing`, `positions` for issues where they have a sourced position, and at least one sourced `moves` entry.
5. Run `npm run portraits` to download their portrait. If it fails, leave `portrait` as `null` and mention it in the report.

Nobody is deleted. A candidate who rules out running moves to `declined`, with a `statusNote` and a `moves` entry saying so.

## Race summary

If the shape of the race has changed (a major declaration or withdrawal, a big polling shift, a debate, a primary result), rewrite `meta.raceSummary`: set `asOf` to today, write a short factual `headline` and two to four short `paragraphs`, and list the `sources` you relied on. If nothing material changed, leave it alone.

## Finishing

1. Run `npm run validate` and fix every error. Warnings about ordering mean you put something in the wrong place; fix those too.
2. Update `data/meta.json`:
   - Set `previousUpdate` to the current `lastUpdated`. If `lastUpdated` is already today (another run went first), leave `previousUpdate` as it is.
   - Set `lastUpdated` to today's date.
   - Add an entry at the top of `updates` with today's date and a one- or two-sentence `summary` of what changed (for example "Candidates: Newsom formed an exploratory committee; Shapiro's tariff position updated; new RealClearPolling standings.").
   - If nothing changed, still do all three and say so in the summary ("Candidates: no changes found.").
3. Run `npm run build` and confirm it succeeds.
4. Write a short report as your final message: each change, with the candidate, what changed, and the source link; anything you found but left out because sourcing was too thin; any portrait failures. If nothing changed, say so.

Never commit or push unless the schedule's own instructions tell you to.
