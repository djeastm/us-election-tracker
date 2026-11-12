# Update run: pundits and media

You are running a scheduled update of 2028 Watch, a static tracker for the 2028 US presidential election. This run covers the Pundits section: what media figures with large audiences say about the 2028 candidates, and how big those audiences are.

Read `CLAUDE.md` in the repo root before doing anything else. It defines the data contract and the rules for update runs, and it overrides anything here that seems to conflict with it.

## Goal

Bring `data/pundits.json` and `data/outlets.json` up to date since `meta.lastUpdated` in `data/meta.json`. Specifically:

- New stances by tracked pundits on tracked candidates (anyone in `data/candidates.json`), or on a subject such as a third party or their own candidacy.
- Changes of mind: a pundit who backed one candidate and now backs another, or who has turned on someone.
- New pundits, when someone with real reach takes a clear public position on the race.
- Audience figures that are not YouTube, such as monthly cable ratings.
- Spectrum placement, only when the evidence about someone has changed.

A run that makes three to six well-sourced changes is a good run. Do not pad it with weak items. A run that finds nothing new is also fine.

## Research procedure

1. Note the date of the last update (`meta.lastUpdated`) and focus on what happened after it.
2. Check these starting points:
   - Media Matters for America. Its archives at https://www.mediamatters.org/archives list networks, shows and personalities, and it regularly publishes roundups of who right-wing media figures back for 2028. The seed for this tracker was https://www.mediamatters.org/jd-vance/right-wing-media-figures-set-stage-who-they-want-gop-ticket-2028. Media Matters is a progressive watchdog: use it to find clips and quotes, then confirm against the original video, transcript or post where you can.
   - Adweek TVNewser, which publishes monthly cable news ratings (primetime and total day viewers).
   - Mediaite, for daily coverage of what hosts said on air.
   - Axios's 2028 newsletter and coverage.
   - The Bulwark, for center-right and anti-Trump commentary.
3. Search each tracked pundit's name with "2028", and with the names of the leading candidates (for example "Megyn Kelly Vance", "Tucker Carlson Rubio 2028"). Also search the leading candidates' names with "endorse" or "backs" plus "host" or "podcast".
4. For each candidate finding, get to the primary record: the episode, the clip, the transcript, the post on X, the column. Copy any quote exactly from that record.
5. Decide whether the finding is a real stance. Praise in passing, a joke, or a host reading a guest's view is not a stance. A clear statement of preference, opposition, or a change of mind is.

## Sourcing rules

- Never invent a quote. `quote` is verbatim or `null`. Paraphrase goes in `context`, one sentence in neutral words.
- Prefer primary reporting: the show itself, a transcript, the person's own post, or a mainstream news report that quotes them. When the only source is a partisan outlet (Media Matters, a partisan blog, a rival host) or a single thin report, say so in `context`, for example "Reported by Media Matters; the full episode was not available."
- Use neutral language for everyone, whatever their politics. Describe what they said, not what you think of it.
- Every stance has one `source` with title, publisher, https url and date.

## How to edit the files

`data/pundits.json`:

- Stances are append-only. Add each new stance at the top of that pundit's `stances` array (newest first). Never edit or delete an older stance, even when the pundit has changed their mind; the newer entry supersedes it.
- `candidate` is a candidate id from `data/candidates.json`. If the stance is about someone not tracked as a candidate, or about a subject (a third party, their own run, the Republican Party), set `candidate` to `null` and fill `subject`. If a pundit backs someone who should be tracked as a candidate, mention it in your report so the candidates run can consider adding them; do not add candidates in this run.
- `position` is one of support, leaning, neutral, skeptical, oppose.
- `spectrum` is an editorial judgment. Change `score` or `faction` only when the person's politics have visibly shifted, and update `rationale` to say why.

`data/outlets.json` and the `reach` arrays inside `platforms`:

- Update a reach figure by replacing `value`, `asOf` and the `source`. For cable ratings, use the latest monthly TVNewser figures and name the month in `metric` (for example "Primetime average viewers, November 2026") and in `asOf` (`2026-11`).
- Do not hand-edit YouTube figures. Entries with a `youtube` handle are refreshed by `npm run reach`.
- If a pundit moves to a new show or outlet, add a new platform entry. If the outlet is not in `outlets.json`, add it there first with a kebab-case id.

## Adding a pundit

Add someone only if they have real reach (a national TV or radio show, a top podcast, or a very large following) and have taken a clear public position on the race. Keep a rough balance across right, left and center; the tracker started right-heavy because of its seed source, so prefer well-sourced additions from the left and center when they qualify.

For a new pundit:

1. Choose an id: their name in lowercase kebab-case (`firstname-lastname`). Ids never change once published.
2. Set `wikipedia` to the exact English Wikipedia page title (for example "Tim Miller (political strategist)"). Check that the page exists.
3. Set `portrait` to `null`.
4. Fill `side`, `bio` (two or three neutral sentences), `spectrum` with a `rationale`, `platforms` (with `reach` entries where you have a sourced number, and a `youtube` handle where they have a channel), and at least one sourced stance.
5. Run `npm run portraits` to download their portrait. If it fails, leave `portrait` as `null` and mention it in the report.

Never delete a pundit.

## Finishing

1. Run `npm run validate` and fix every error. Warnings about ordering mean you put something in the wrong place; fix those too.
2. Run `npm run reach` to refresh YouTube subscriber counts. If it warns that a handle failed to parse, leave that entry and mention it in the report.
3. Update `data/meta.json`:
   - Set `previousUpdate` to the current `lastUpdated`. If `lastUpdated` is already today (another run went first), leave `previousUpdate` as it is.
   - Set `lastUpdated` to today's date.
   - Add an entry at the top of `updates` with today's date and a one- or two-sentence `summary` of what changed (for example "Pundits: Megyn Kelly moved from leaning to support on Vance; added Ezra Klein's case against a Harris run; November cable ratings.").
   - If nothing changed, still do all three and say so in the summary ("Pundits: no new stances found.").
4. Run `npm run build` and confirm it succeeds.
5. Write a short report as your final message: each change, with the pundit, what changed, and the source link; anything you found but left out because sourcing was too thin; any reach or portrait failures. If nothing changed, say so.

Never commit or push unless the schedule's own instructions tell you to.
