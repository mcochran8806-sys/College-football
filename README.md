# CFB Saturday — two-screen college football dashboard

Two unattended TV screens driven by one backend:

| Route | Screen | What it does |
|---|---|---|
| `/` | Scoreboard TV | Full FBS slate, favorites first, auto-paginating, 20s refresh |
| `/highlights` | Highlight wall | Auto-rotating YouTube highlights + live scoring-play interstitials |
| `/settings` | Team picker | Click favorites, get a URL to point each TV at (open on a phone/laptop) |

Vite + React + TypeScript + Tailwind, deployed to Vercel's free tier. The
browser never talks to ESPN or YouTube directly — everything goes through
`/api` serverless functions, so the YouTube key never leaves the server.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # then fill in YOUTUBE_API_KEY (or set MOCK=1)
npm run dev                    # http://localhost:5173
```

`npm run dev` serves the React app **and** the `/api` functions. There's no
separate `vercel dev` step: a small Vite plugin (`vite-plugin-api.ts`) loads the
same handler files Vercel runs and hands them a Vercel-shaped request/response.
One command, one code path.

### Developing on a Tuesday in July

```bash
MOCK=1 npm run dev
```

Serves fixture data from `fixtures/` — a 13-game slate covering in-progress,
red zone, close-and-late 4th quarter, halftime, final, final/OT, and upcoming
states, plus a game deliberately missing its broadcast and situation objects to
exercise the defensive parsing. The mock scoreboard is *raw ESPN-shaped* JSON,
not pre-normalized, so mock mode runs through the same `shrinkScoreboard()`
code as production.

Mock mode also reveals a new scoring play roughly every 45 seconds, so the
score-card interstitials on the highlight wall are testable without waiting for
a real touchdown.

### Other commands

```bash
npm run build             # typecheck + production build
npm run typecheck         # tsc only
npm run test:matcher      # title-matching regression test (see below)
npm run resolve-channels  # one-time YouTube channel ID lookup
```

---

## Getting a YouTube API key

1. Go to <https://console.cloud.google.com/> and sign in.
2. **Create a project.** Top bar → project dropdown → *New Project*. Name it
   anything ("cfb-dashboard"). The 10,000 unit/day quota is *per project*, so a
   dedicated project keeps this app's usage away from anything else you build.
3. **Enable the API.** *APIs & Services* → *Library* → search
   "YouTube Data API v3" → *Enable*.
4. **Create the key.** *APIs & Services* → *Credentials* → *Create Credentials*
   → *API key*. Copy it.
5. **Restrict it** (do this — an unrestricted key found in a log is a bad day).
   Click the key → *API restrictions* → *Restrict key* → select **YouTube Data
   API v3** only. Leave *Application restrictions* set to **None**: the calls
   come from Vercel's servers, whose IPs aren't stable, and the key is never
   exposed to a browser so referrer restrictions don't apply.
6. Put it in `.env.local`:
   ```
   YOUTUBE_API_KEY=AIza...
   ```
7. For production, add the same variable in Vercel → Project → *Settings* →
   *Environment Variables*. Do **not** prefix it with `VITE_` — that would
   bundle it into the client.

Quota resets at midnight **Pacific** time.

### Filling in the channel IDs

`config.ts` ships with `TODO_VERIFY` for most channels, on purpose: a wrong
channel ID returns an empty playlist and fails *silently*, so guessing them
would be worse than leaving them blank. Resolve them once. Easiest way, no local setup at all — once
`YOUTUBE_API_KEY` is set in Vercel, open:

```
https://cfb-saturday.vercel.app/api/resolve-channels
```

It prints the real ids and a paste-ready config block. Cached 24h, so
refreshing it can't burn quota.

Or from a local checkout:

```bash
npm run resolve-channels
```

Each channel carries a list of **candidate handles**, tried in order until one
resolves. Networks rename their channels and the obvious handle is often wrong
— `@SECNetwork` and `@bigtennetwork` both 404 — so rather than guessing one
spelling, the YouTube API arbitrates a short list. `channels.list?forHandle`
costs 1 unit per handle actually tried (~33 units for a full run), and it is
never called from a request path.

Channels still marked `TODO_VERIFY` are skipped at runtime with a warning in
the function logs, and a failed lookup never overwrites an id that already
resolved. If none of a channel's candidates exist, find it on youtube.com and
use **Share channel → Copy channel ID**.

---

## Deploying to Vercel

**This project is already deployed:** <https://cfb-saturday.vercel.app>

- Scoreboard TV → <https://cfb-saturday.vercel.app/>
- Highlight wall → <https://cfb-saturday.vercel.app/highlights>

The Vercel project `cfb-saturday` is linked to this GitHub repo with
`claude/college-football-tv-dashboard-5phxjt` as the production branch, so
every push to that branch redeploys. Deployment protection is off, so the TVs
load it without signing in.

**Remaining setup:** add `YOUTUBE_API_KEY` under Vercel → `cfb-saturday` →
*Settings* → *Environment Variables*, then redeploy. Until then the scoreboard
works fully and the highlight wall runs on score cards and the compact
scoreboard.

### Setting it up from scratch

1. Push this repo to GitHub.
2. <https://vercel.com/new> → *Import* the repo. Vercel detects Vite; the
   settings in `vercel.json` (build command, output directory, function config,
   SPA rewrite) are picked up automatically.
3. Before the first deploy, add the environment variable:
   - `YOUTUBE_API_KEY` = your key (Production, Preview, Development)
   - Optionally `MOCK` = `1` on a Preview branch to demo without live games.
4. Deploy. You'll get `https://cfb-saturday.vercel.app`.
   - Scoreboard TV → `https://cfb-saturday.vercel.app/`
   - Highlight wall → `https://cfb-saturday.vercel.app/highlights`

Changing `config.ts` (favorites, channels, intervals) requires a redeploy —
it's compiled into both the client bundle and the functions.

### What the free tier gives you

The 15s scoreboard cache and `s-maxage=15` edge caching mean multiple TVs
polling cost roughly the same as one. A full 12-hour Saturday with two screens
runs well inside the free tier's function invocation limits.

---

## Kiosk mode

### Amazon Fire TV Stick

The Silk browser is the path of least resistance.

1. From the Fire Stick home screen, search for and install **Amazon Silk
   Browser**.
2. Open Silk → navigate to your Vercel URL.
3. Menu (☰) → **Add to Home** so the TV can jump straight there next time.
4. Menu → **Settings** → turn on **Full Screen** and set *Sleep timer* to
   **Never**.
5. On `/highlights`, press the remote's **OK** button once when the "Tap to
   start" overlay appears — the wall listens for Enter/Space as well as taps,
   because a Fire Stick remote sends key events, not clicks.
6. To stop the Fire Stick sleeping mid-game: *Settings* → *Display & Sounds* →
   *Display* → *Screensaver* → *Start after* → **Never**.

Silk's video decoding is adequate for 1080p embeds. If clips stutter, cap them
by lowering the highlight poll frequency rather than the resolution — most
stutter comes from the wall having competing network work to do.

### Raspberry Pi (Chromium kiosk + systemd)

Tested shape for a Pi 4 running Raspberry Pi OS with a desktop session.

Install the bits:

```bash
sudo apt update
sudo apt install -y chromium-browser unclutter xdotool
```

Create the launch script — `/home/pi/cfb-kiosk.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

URL="${1:-https://cfb-saturday.vercel.app/}"

# Stop the screen blanking mid-game.
xset s off
xset -dpms
xset s noblank

# Hide the cursor after 0.1s of inactivity.
unclutter -idle 0.1 -root &

# Chromium remembers that it crashed and shows an infobar on next launch, which
# would sit on screen for twelve hours. Scrub the flags that trigger it.
CFG="$HOME/.config/chromium/Default/Preferences"
[ -f "$CFG" ] && sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/; s/"exited_cleanly":false/"exited_cleanly":true/' "$CFG"

exec chromium-browser \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=TranslateUI,Translate \
  --no-first-run \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --start-fullscreen \
  --window-position=0,0 \
  "$URL"
```

```bash
chmod +x /home/pi/cfb-kiosk.sh
```

`--autoplay-policy=no-user-gesture-required` is the important one on the
highlight wall: it lets clips start unmuted without the tap. Leave the overlay
in place anyway — it's harmless and covers the case where the flag is ignored.

The systemd unit — `/etc/systemd/system/cfb-kiosk.service`:

```ini
[Unit]
Description=CFB Saturday kiosk
After=graphical.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/pi/.Xauthority
ExecStart=/home/pi/cfb-kiosk.sh https://cfb-saturday.vercel.app/
Restart=always
RestartSec=10

[Install]
WantedBy=graphical.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cfb-kiosk.service
journalctl -u cfb-kiosk -f      # watch it come up
```

For the second screen, copy the unit to `cfb-kiosk-highlights.service` and
change the URL to `.../highlights`.

### Desktop Chrome (either OS)

```bash
# macOS
open -na "Google Chrome" --args --kiosk --autoplay-policy=no-user-gesture-required \
  "https://cfb-saturday.vercel.app/"

# Linux
google-chrome --kiosk --autoplay-policy=no-user-gesture-required \
  "https://cfb-saturday.vercel.app/"

# Windows (PowerShell)
Start-Process chrome '--kiosk --autoplay-policy=no-user-gesture-required "https://cfb-saturday.vercel.app/"'
```

Or just open the URL and press **F11**. Exit kiosk with `Ctrl/Cmd+W`.

---

## Picking favorite teams

Open **`/settings`** on a phone or laptop (not the TVs — they stay
non-interactive). Click teams, and the page builds you a URL:

```
https://cfb-saturday.vercel.app/?f=Georgia,Georgia%20Tech,Alabama
https://cfb-saturday.vercel.app/highlights?f=Georgia,Georgia%20Tech,Alabama
```

**That URL is the setting.** Point each TV at it — or bookmark it — and the
choice sticks. There's no database and nothing to save, which is the point: it
survives a TV browser clearing its own storage, and the two screens can even
run different favorites.

Favorites resolve in this order, first match wins:

1. `?favorites=` or the short `?f=` in the URL — the source of truth
2. `localStorage` — a convenience mirror on that one device, never load-bearing
3. `FAVORITE_TEAMS` in `config.ts` — the always-present fallback

The scoreboard header lists the active favorites (`* Georgia · Georgia Tech ·
Alabama`), so you can tell at a glance whether a URL took effect. If it says
`(defaults)`, the URL didn't parse and you're seeing `config.ts`.

The `?f=` short form exists because typing a URL on a Fire Stick remote is
miserable. To change the defaults permanently instead, edit `FAVORITE_TEAMS` in
`config.ts` and push.

Favorites also travel to `/api/plays` as a query param, because that endpoint
decides which games to poll ESPN for and has to agree with what the screen
treats as a favorite.

## Configuration

Everything tunable lives in `config.ts`:

| Setting | Default | Notes |
|---|---|---|
| `FAVORITE_TEAMS` | Georgia, Georgia Tech, Alabama | Abbreviations or names; resolved through the alias table |
| `HIGHLIGHT_CHANNELS` | 12 channels | `TODO_VERIFY` entries are skipped, not guessed |
| `INTERVALS.scoreboardPoll` | 20s | Browser → `/api/scoreboard` |
| `INTERVALS.highlightsPoll` | 2min | Browser → `/api/highlights` |
| `INTERVALS.pageAdvance` | 15s | Scoreboard auto-advance |
| `INTERVALS.scoreCardHold` | 12s | How long an interstitial holds |
| `INTERVALS.burnInShift` | 10min | Layout nudge for OLED panels |
| `GAMES_PER_PAGE` | 6 | 3×2 grid |
| `SLATE.mode` | `live-first` | `all`, `live-first`, or `live-only` — see below |
| `SLATE.maxPages` | 4 | Caps the rotation; 0 disables |
| `CLOSE_GAME` | 4th qtr, ≤8 pts | Triggers the accent glow |
| `DEBUG_DATE` | `''` | Set `YYYYMMDD` to pin a past slate |

---

## How it works

### `/api/scoreboard`

Proxies ESPN's undocumented scoreboard endpoint with `groups=80` (FBS) and
`limit=100` — **both required**; without them ESPN quietly returns ~17 games
instead of the full slate. Accepts an optional `?dates=YYYYMMDD`.

Caches 15s in-process, sets `Cache-Control: s-maxage=15,
stale-while-revalidate=30`, and strips ESPN's very large payload down to what
the TVs render (~13KB out of ~1.2MB raw). On upstream failure it returns the
last good payload with `stale: true` rather than erroring.

**Do not add a browser User-Agent to these requests.** ESPN fronts the endpoint
with Akamai, and a datacenter IP claiming to be Chrome is a bot signature.
Measured from a Vercel function in `iad1`:

| Request | Result |
|---|---|
| No headers at all | **200** (99 games) |
| `User-Agent: Chrome/126` | 403 Access Denied |
| UA + Accept + Accept-Language | 403 |
| UA + Accept + Accept-Language + Referer | 403 |
| Full browser set (Sec-Fetch-\*, sec-ch-ua, Origin) | 403 |

An honest, plain request works; a disguised one gets blocked. `fetchEspnJson()`
also falls back to `site.web.api.espn.com` (byte-identical payloads, different
edge config) on a 403 or 429, so a mid-season policy change on the primary host
doesn't take the dashboard down.

### `/api/highlights`

Polls each channel's **uploads playlist** with `playlistItems.list`.

```
search.list        = 100 units/call  ->  ~100 calls/day. Never used here.
playlistItems.list =   1 unit /call  ->  what we use.
channels.list      =   1 unit /call  ->  one-time ID resolution, offline script.

12 channels × 1 unit × 30 polls/hour × 12 hours = 4,320 units/day
```

...against a 10,000/day budget. The uploads playlist ID is derived from the
channel ID by changing the second character from `C` to `U` (`UCxxxx` →
`UUxxxx`), which costs zero API calls. A 403 `quotaExceeded` is logged and the
cached results are served; the flag clears when the day rolls over.

### `/api/teams`

Full FBS team list for the settings picker, cached 24h — FBS membership
changes about once a year.

### `/api/plays`

Fetches ESPN's `summary?event={id}` for games that are **in progress AND in
your favorites** — never the whole slate. Metadata only; the video objects in
that response are DRM/geo restricted and are not touched.

It returns the *full* chronological scoring-play feed rather than a diff.
Serverless instances don't share memory, so a server-side "what's new" diff
would fire duplicate cards on a cold instance or miss them entirely depending
on routing. The highlight wall keeps the seen-set in React state instead, which
is deterministic and needs no database.

### Title matching

Matching "Ole Miss at LSU Highlights | SEC Football 2025" to the right game is
the fiddliest part of the app. `src/lib/matchTitle.ts`:

1. Normalizes the title — lowercase, strip emoji/punctuation/years and the
   boilerplate every network writes differently ("Extended Highlights", "Full
   Game", "vs", "at").
2. Builds every alias for both teams of every game on the slate, from ESPN's
   `displayName` / `shortDisplayName` / `abbreviation` / `location` plus
   `shared/teamAliases.ts` (~55 schools that get written inconsistently).
3. Matches **longest alias first and consumes the matched span**. Without this,
   "Texas A&M vs Texas" double-counts "texas", and "Miami (OH)" satisfies the
   Miami (FL) game.
4. Requires **two distinct team matches belonging to the same game**. Two
   matches alone isn't enough — "Georgia and Ohio State are on a collision
   course" matches two teams from two different games and must be rejected.

Tokens that map to more than one FBS program (`osu`, `msu`, `isu`, bare
`miami`, …) are in `AMBIGUOUS_TOKENS` and never match alone.

Run `npm run test:matcher` after editing the alias table — it exercises the
real matcher against the fixture slate, including the negative cases.

### Failure behavior

Everything degrades to something watchable rather than erroring:

- ESPN down → last good payload, `stale: true`, amber dot in the header
- YouTube quota gone → cached clips + a small banner
- Clip won't embed (IFrame error 101/150, several times an hour in normal
  operation) → dropped from the queue, next clip starts
- Video queue empty → recent score cards alternating with a compact scoreboard
- No API at all → "Loading the slate…", never a stack trace

Nothing uses `localStorage`; per the brief, TV browser storage isn't trusted.
Played-clip and seen-play state is session memory only.

---

## Notes and caveats

- **ESPN's default slate is the current week, not today.** With no `?dates`
  param ESPN returns the whole week — ~99 games mid-season. That's why `SLATE`
  exists: `live-first` drops games that haven't kicked off once there's enough
  live football to fill a page (favorites are never dropped), and `maxPages`
  caps the rotation so a lap takes about a minute instead of four. Set
  `SLATE.mode` to `all` for the raw, unfiltered week. To pin a single day
  instead, set `DEBUG_DATE` in `config.ts` or pass `?dates=YYYYMMDD`.
- **ESPN's endpoints are undocumented and unofficial.** The schema can shift
  mid-season. Every field access in `api/_lib/espn.ts` is optional-chained and
  coerced, and `shrinkScoreboard()` is contractually required to return a valid
  (possibly empty) array for *any* input rather than throwing. If ESPN changes
  something, expect missing data, not a white screen.
- **No video is downloaded, proxied, or rehosted.** YouTube IFrame embeds only.
- The in-memory caches are per serverless instance. The edge cache
  (`s-maxage`) is what actually collapses many TVs into one origin request;
  in-flight coalescing handles concurrent requests to a cold instance.
