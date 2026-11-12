<img src="assets/icon.svg" width="64" height="64" alt="">

# 2028 Watch

A static tracker for the 2028 US presidential election. It builds to a single self-contained HTML file with no server and no runtime dependencies.

## Sections

- **Candidates** (live): who is running or might, their status, polling standing, positions on the key issues with history, and recent moves.
- **Pundits** (live): what media figures with large audiences say about the candidates, where they sit on the spectrum, and how big their audience is.
- **Polls** (planned).
- **States** (planned).

## Build and view

Requires Node 20 or later. There are no npm dependencies to install.

```
npm run build
```

Then open `dist/index.html` in a browser. The file has the CSS, JavaScript, data and portraits inlined, so it can be opened directly or copied anywhere.

Other commands:

- `npm run validate` checks every data file against the contract and lists any problems.
- `npm run portraits` downloads a freely licensed Wikipedia portrait for anyone whose `portrait` is `null` (`--force` to refresh all, `--only <id>` for one person).
- `npm run reach` refreshes YouTube subscriber counts (`--dry-run` to preview).

## How updates work

Content is updated by scheduled runs of an LLM agent, each set up as a T3 Code scheduled task. Each run is given one of the prompts in `tasks/`:

- `tasks/update-candidates.md`: declarations, status, positions, polling standing, moves, and the race summary.
- `tasks/update-pundits.md`: new pundit stances, changes of mind, new pundits, and audience figures.

The agent researches the web, edits the JSON in `data/`, validates, records the run in `data/meta.json`, and rebuilds. The data contract and the rules for update runs are in `CLAUDE.md`.

## Where things live

```
data/              meta.json, issues.json, candidates.json, outlets.json, pundits.json
assets/portraits/  portraits, written by scripts/portraits.mjs (committed)
src/               index.html, styles.css, app.js (the front end)
scripts/           validate.mjs, build.mjs, portraits.mjs, reach.mjs
tasks/             prompts for the scheduled update runs
dist/              build output, not committed
```
