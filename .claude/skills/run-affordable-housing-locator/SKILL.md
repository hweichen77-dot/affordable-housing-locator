---
name: run-affordable-housing-locator
description: Run, start, build, launch, screenshot, or drive the Affordable Housing Locator Tauri desktop app. Use for UI verification, feature testing, or visual regression.
---

# Run: Affordable Housing Locator

Tauri v2 desktop app (Rust backend + React/TS frontend). Two run modes: **Vite dev server** (browser-driven, no Tauri commands — use for UI layout/component work) and **full Tauri app** (native binary, all commands wired — use when testing data fetching, Near Me, or LIHTC/public housing search).

Driver: Puppeteer MCP (`mcp__puppeteer__*` tools). No separate driver script needed — use the MCP tools directly from Claude Code.

## Prerequisites

- Node ≥ 18, Rust/Cargo (for Tauri build)
- `npm install` inside `affordable-housing-locator/`
- Port 1420 free

## Run (agent path — UI only)

```bash
cd /Users/jasonhuang/affordable-housing-locator
npm run dev &
# wait ~3s for Vite to start
curl -s -o /dev/null -w "%{http_code}" http://localhost:1420  # expect 200
```

Then drive with Puppeteer MCP:

```
mcp__puppeteer__puppeteer_navigate  url=http://localhost:1420
mcp__puppeteer__puppeteer_screenshot  name=<label>  width=1280  height=800
```

### Verified interactions (this session, 2026-06-12)

```
# Skip AMI survey (shown on first visit — localStorage has no survey data)
mcp__puppeteer__puppeteer_click  selector=.survey-skip-btn

# Click a city chip on welcome screen
mcp__puppeteer__puppeteer_evaluate
  script: Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'San Jose, CA').click()

# List all button labels
mcp__puppeteer__puppeteer_evaluate
  script: Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t.length > 1).join(' | ')

# Fill topbar search box
mcp__puppeteer__puppeteer_fill  selector=input[placeholder*="city"]  value="Chicago, IL"
mcp__puppeteer__puppeteer_click  selector=button.topbar-search-btn
```

### Screenshots taken this session

| File | What it shows |
|---|---|
| `welcome-home` | Welcome screen after survey skip — search bar, city chips, Near Me CTA |
| `search-results` | Results view after San Jose chip click — empty state (expected: Tauri backend not running) |

## Run (full Tauri — data fetching wired)

```bash
cd /Users/jasonhuang/affordable-housing-locator
npm run tauri dev
```

Window opens natively on macOS. Tauri commands (`fetch_lihtc`, `fetch_public_housing`, `geocode_query`) are live. Search and Near Me work.

## Build + install to /Applications

```bash
cd /Users/jasonhuang/affordable-housing-locator
npm run tauri build
cp -R "src-tauri/target/release/bundle/macos/Affordable Housing Locator.app" "/Users/jasonhuang/Applications/"
```

## Gotchas

- **AMI survey blocks first load.** `localStorage.clear()` resets it → survey shows again. Survey has a skip button (`.survey-skip-btn`). After first skip, `localStorage` has `housing-ami-done=1` — subsequent loads go straight to welcome.
- **City chip search returns no results in Vite-only mode.** City chips → `invoke("fetch_lihtc", …)` → Tauri not running → silent empty response. Normal. Use `npm run tauri dev` for real results.
- **Near Me button needs OS location permission.** In Tauri app: macOS prompts on first use. In browser: browser permission prompt. In headless/Puppeteer: `navigator.geolocation` call will time out (no permission). Cannot test Near Me via Puppeteer.
- **Port 1420 conflict.** If another `vite` process is running, `npm run dev` picks 1421+. Check with `lsof -i :1420`.
- **Survey re-shows after `localStorage.clear()`.** Clear only specific keys if you want to reset just one part: `housing-ami-done`, `housing-search-history`, `housing-app-status-v1`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `curl http://localhost:1420` returns connection refused | Vite not started yet — wait 3–5s after `npm run dev` |
| Puppeteer screenshot shows survey instead of welcome | Click `.survey-skip-btn` first |
| Tauri build fails: `NSLocationWhenInUseUsageDescription` missing | Already in `src-tauri/Info.plist` — re-check Cargo.toml version matches tauri.conf.json |
| `No homes found in this area` after search | Expected in Vite-only mode — use `npm run tauri dev` for live data |
