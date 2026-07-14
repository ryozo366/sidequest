---
name: verify
description: Build/launch/drive recipe for verifying Sidequest changes end-to-end.
---

# Verifying Sidequest

Zero-dependency Node app — no build step, no install.

## Launch

```bash
rm -rf data                      # optional: re-seed demo quests
PORT=3000 node ./server.js       # serves UI + JSON API
```

`data/quests.json` is created from `seed/quests.seed.json` on first request.
Don't `pkill -f "node server.js"` from a compound command — it matches its own
shell; use `pkill -f "node ./server.js"` or kill by PID.

## Drive the UI (headless Chromium)

Playwright is installed globally; resolve it with
`NODE_PATH=/opt/node22/lib/node_modules node <script>`.
Mock geolocation via browser context:
`{ geolocation: { latitude, longitude }, permissions: ['geolocation'] }` —
the "Use my location" buttons then work headlessly.
Accepting a quest opens a `prompt()` dialog — handle with `page.once('dialog', d => d.accept('Name'))`.

Flows worth driving: radius chips (default location Berlin Mitte: 10 km → 7 seeds,
5 km → 4, 1 km → 0/empty state, all → 12), post-quest modal, accept quest,
sort by pay/newest.

## Drive the API

```bash
curl "http://localhost:3000/api/quests?lat=52.52&lng=13.405&radius=10"
```

Good probes: `radius` without lat/lng (400), non-numeric/negative radius (400),
POST with `pay: null` (400), invalid JSON body (400), path traversal on static
routes (404).
