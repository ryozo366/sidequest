# ⚔️ Sidequest

A local quest board. Someone needs their garden cleaned up, a sofa carried, a dog
walked — they post a **sidequest** describing the task, the reward, and the time it
takes. Helpers nearby browse the board, filter by **radius** (1 / 5 / 10 / 25 / 50 km),
and accept quests.

Zero dependencies — plain Node.js, runs anywhere Node ≥ 18 is installed.

## Run it

```bash
npm start          # http://localhost:3000
```

The board is seeded with demo quests around Berlin on first start (stored in
`data/quests.json`, which is gitignored — delete it to re-seed).

## Features

- **Post a sidequest** — title, description, reward (€), time required, optional
  deadline, category, and location (browser geolocation or manual coordinates).
- **Radius filter** — 1 / 5 / 10 / 25 / 50 km or any distance, measured from your
  location with the haversine formula. Distances are shown on every card.
- **Your location** — use browser geolocation, or set it manually; it's remembered
  in your browser.
- **Filter & sort** — by category, nearest first, best pay, or newest.
- **Accept quests** — claim a quest; it's marked as taken so nobody double-books.

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/quests?lat=52.52&lng=13.405&radius=10&category=Garden&status=open` | List quests. With `lat`/`lng`, each quest gets `distanceKm` and results sort nearest-first; `radius` (km) filters by distance. |
| `POST` | `/api/quests` | Create a quest. JSON body: `title`, `description`, `pay`, `duration`, `completeBy?` (YYYY-MM-DD), `category`, `locationName`, `lat`, `lng`, `postedBy`. |
| `POST` | `/api/quests/:id/accept` | Accept an open quest. JSON body: `acceptedBy`. Returns `409` if already taken. |

## Tests

```bash
npm test
```

Covers the haversine distance math and the API end-to-end (radius filtering,
validation, posting, accepting) using Node's built-in test runner.

## Project layout

```
server.js            HTTP server: static files + JSON API
lib/geo.js           Haversine distance + coordinate validation
lib/store.js         JSON-file persistence (seeds on first run)
seed/quests.seed.json  Demo quests around Berlin
public/              Frontend (vanilla HTML/CSS/JS)
test/                Node test-runner suites
```
