# Deploying Sequence Online

The app is one Node process: it serves the built client and the WebSocket game server on `PORT`.
Any host that runs Docker or Node and allows WebSockets works. Render's free tier is the simplest.

## Option A — Render (free, no CLI)

1. Push this folder to GitHub:
   ```bash
   gh auth login
   gh repo create sequence-online --private --source=. --push
   ```
2. Go to https://dashboard.render.com → **New +** → **Blueprint** → pick the `sequence-online` repo.
   Render reads `render.yaml` and builds the Dockerfile. Press **Apply**.
3. After the first build (3–5 min) you get a URL like `https://sequence-online.onrender.com`.
   Share it, or create a room in the app and send the invite link.

Free instances sleep after 15 minutes idle; the first visit afterwards takes ~1 minute to wake.
Rooms live in memory, so a restart clears them.

## Option B — Fly.io

```bash
brew install flyctl
fly auth login
fly launch --copy-config --yes
```
`fly.toml` is already configured; the URL is `https://sequence-online.fly.dev` (change `app` if taken).

## Option C — Any VPS / your own machine

```bash
npm ci && npm run build
PORT=80 npm start
```
Put it behind HTTPS (Caddy or nginx with WebSocket upgrade on `/ws`) so browsers allow `wss://`.
