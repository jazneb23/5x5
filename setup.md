# Setting up 5x5 ("workout") on a new machine

This repo is fully pushed to GitHub (`jazneb23/5x5`, clean working tree) and
has zero credentials or backend — but it has the trickiest data-migration
problem of all five projects: **your actual workout history isn't a file in
this folder at all.** It lives in IndexedDB, inside the browser, on the old
Mac. Copying the repo gets you the app; it does not get you your training
log.

## Before you do anything else: export your data

On the **old** Mac, with the app running, open it in the browser, go to
**Settings**, and export the JSON backup. That file is your only copy of
every workout you've logged. AirDrop it separately — it isn't part of this
repo and there's nothing this setup can do to grab it for you automatically.

If you've already left the old Mac behind without doing this, there's no
recovery path — IndexedDB doesn't sync anywhere and isn't part of a Time
Machine-style file backup in any form you can just go pull from.

## What travels in git

Everything — full React 19 + Vite + TypeScript PWA, no backend, no database
file, no `.env` (there's nothing to have credentials for).

## What does NOT travel

Your workout history (see above — it's a manual export, not a repo file).
Nothing else.

## Steps

### 1. Clone and install

```bash
cd ~
git clone https://github.com/jazneb23/5x5.git workout
cd workout
npm install
```

### 2. Run it

```bash
npm run dev
```

### 3. Import your data

Open the app, go to **Settings**, and import the JSON file you exported from
the old Mac before switching.

### 4. (Optional) Install on your phone

```bash
npm run build && npm run preview -- --host
```

On your phone, connect to the same network, open the printed `Network:` URL,
and add it to your home screen. The service worker precaches the app so it
keeps working offline afterward.

## Verify the move worked

- Settings → Import completes without an error
- Your lift history and current progression (weights, streak) show up exactly
  as they were on the old Mac
- `npm test` passes (domain-layer unit tests, no data dependency)

## Things worth knowing

- **No accounts, no cloud sync, by design** — see `CLAUDE.md`. There is no
  server-side copy of your data anywhere to fall back on if the export step
  gets skipped.
- `files/` is a gitignored, permissions-restricted (700) folder holding
  original reference docs — `docs/` has the canonical, git-tracked copies of
  the same specs, so `files/` is very likely safe to leave behind. Confirm
  before discarding, since it's access-restricted and may have been kept
  private on purpose.
- `dist/`, `dev-dist/`, `node_modules/` are all build output/dependencies —
  don't copy them, `npm install` and `npm run build` regenerate them.
- No `.nvmrc` in this repo; whatever recent Node you have installed is fine.
