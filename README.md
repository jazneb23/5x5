# 5x5

Personal StrongLifts 5x5 training log. Local-first PWA — no accounts, no cloud sync, no backend. All data lives in IndexedDB on your device; the JSON export in Settings is your only backup.

See [CLAUDE.md](CLAUDE.md) for architecture rules and [docs/](docs/) for the full requirements and design specs.

## Development

```bash
npm install
npm run dev       # dev server
npm test          # domain layer unit tests
npm run build     # production build to dist/
npm run preview   # serve the production build, e.g. to install on a phone over LAN
```

## Installing on a phone

1. Run `npm run build && npm run preview -- --host`.
2. On your phone, connect to the same network and open the printed `Network:` URL.
3. Add it to your home screen. The service worker precaches the app, so it keeps working offline afterward.
