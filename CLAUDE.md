# 2028 Watch

A static tracker for the 2028 US presidential election. All content lives in JSON under `data/`. The site in `src/` only renders it. Scheduled LLM tasks (see `tasks/`) research the web and edit the JSON; nothing else needs to change for an update.

## Layout

```
data/        meta.json, issues.json, candidates.json, outlets.json, pundits.json
assets/portraits/   <person-id>.jpg, written by scripts/portraits.mjs
src/         index.html, styles.css, app.js  (no framework, no dependencies)
scripts/     validate.mjs, build.mjs, portraits.mjs, reach.mjs  (Node 20+, no dependencies)
tasks/       prompts for the periodic update runs
dist/        build output (single self-contained index.html), not committed
```

## Commands

- `npm run validate` checks every data file against the contract below. Run it after any data edit.
- `npm run build` validates, then writes `dist/index.html` with CSS, JS, data and portraits inlined.
- `npm run portraits` downloads a freely licensed portrait from Wikipedia for anyone whose `portrait` is `null`.
- `npm run reach` refreshes YouTube subscriber counts for every reach entry that has a `youtube` handle.

## Data contract

Dates are `YYYY-MM-DD`, or `YYYY-MM` or `YYYY` when only the month or year is known. Ids are lowercase kebab-case and never change once published.

A **source** is `{ "title", "publisher", "url", "date" }`. `url` must be https. Every claim about what someone said or did carries at least one source.

### meta.json

```
{ "title", "electionDate", "lastUpdated", "previousUpdate",
  "raceSummary": { "asOf", "headline", "paragraphs": [string], "sources": [source] },
  "updates": [ { "date", "summary" } ]            // newest first, one entry per update run
}
```

### issues.json

Array of `{ "id", "name", "question", "low", "high" }`. `low` and `high` name the two ends of that issue's five-point scale. The scale is specific to the issue and is not a left–right axis.

### candidates.json

```
{ "id", "name", "party": "R" | "D" | "I",
  "role", "born", "home", "wikipedia",
  "portrait": null | { "file", "credit", "license", "source" },
  "status": "declared" | "exploring" | "interested" | "undecided" | "speculated" | "declined",
  "statusNote",                                   // one sentence, what they last said about running
  "bio",                                          // two or three sentences
  "standing": null | { "text", "asOf", "source": source },
  "positions": {
    "<issueId>": {
      "label",                                    // six words or fewer
      "lean": -2 | -1 | 0 | 1 | 2 | null,          // -2 is the issue's `low` end, 2 its `high` end
      "summary",                                  // one to three sentences
      "asOf", "basis": "statement" | "record" | "reported",
      "sources": [source],
      "history": [ { "date", "label", "lean", "note", "sources": [source] } ]   // earlier positions, newest first
    }
  },
  "moves": [ { "date", "text", "sources": [source] } ]    // newest first
}
```

An issue with no entry in `positions` means nothing is on record yet. Leave it out rather than guessing.

### outlets.json

```
{ "id", "name", "kind", "lean",
  "reach": [ { "metric", "value", "asOf", "youtube"?, "source": source } ] }
```

### pundits.json

```
{ "id", "name", "side": "right" | "left" | "center", "wikipedia",
  "portrait": null | { "file", "credit", "license", "source" },
  "bio",
  "spectrum": { "score": -5..5, "faction", "rationale" },     // editorial judgment, -5 far left, 5 far right
  "platforms": [ { "outlet": "<outletId>", "show", "role",
                   "reach": [ { "metric", "value", "asOf", "youtube"?, "source": source } ] } ],
  "stances": [ { "date",
                 "candidate": "<candidateId>" | null,
                 "subject": string | null,                    // required when candidate is null
                 "position": "support" | "leaning" | "neutral" | "skeptical" | "oppose",
                 "quote": string | null,                      // verbatim only
                 "context",                                   // one sentence in our words
                 "venue", "source": source } ]                // newest first
}
```

A pundit's current stance on a candidate is their most recent `stances` entry for that candidate. Stances are append-only: when someone changes their mind, add a new entry and leave the old one.

## Rules for update runs

1. Never invent a quote, a number, or a position. If it cannot be sourced, leave it out.
2. Quotes are verbatim from the source. Paraphrase goes in `context`, never in `quote`.
3. Prefer primary reporting. When the only source is partisan or thin, say so in `context` or `summary`.
4. Positions and stances keep their history. Move the old value into `history` (positions) or add a new entry (stances) instead of overwriting.
5. `spectrum` and `lean` are opinionated classifications. Change them only when the evidence changes, and explain why in `rationale` or `summary`.
6. Describe every figure in neutral language, whatever their politics.
7. After editing: set `meta.previousUpdate` to the old `lastUpdated` (leave it alone if `lastUpdated` is already today, so a second run on the same day does not erase what the first one marked as new), set `lastUpdated` to today, add an entry to `meta.updates`, then run `npm run build`.
