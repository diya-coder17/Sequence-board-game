# Deploying Sequence Online

The app is one Node process: it serves the built client and the WebSocket game server on `PORT`.
Any host that runs Docker or Node and allows WebSockets works. Render's free tier is the simplest.

## Database (recommended for any hosted deployment)

The server stores live games, accounts and head-to-head records. Without a database it writes a JSON
file to disk, which hosts like Render (free tier) wipe on every restart or deploy. To keep games and
accounts safe, add a free MongoDB Atlas cluster:

1. https://www.mongodb.com/cloud/atlas → create a free **M0** cluster.
2. **Database Access** → add a user with a password. **Network Access** → allow `0.0.0.0/0`
   (Render's outbound IPs change).
3. **Connect → Drivers** → copy the connection string, e.g.
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
4. In Render → your service → **Environment** → add `MONGODB_URI` with that string. Save; Render redeploys.
   `GET /healthz` on the server reports `"store":"mongodb"` once it is active.

## Option A — Vercel (web app) + Render (game server)

Vercel cannot run a persistent WebSocket server, so the app and the server are hosted separately.

1. **Game server on Render:** https://dashboard.render.com → **New +** → **Blueprint** → pick this repo → **Apply**.
   Note the URL it gives you, e.g. `https://sequence-online.onrender.com`.
2. **Web app on Vercel:** https://vercel.com/new → import this repo. Before deploying, add an environment variable
   `VITE_WS_URL` = the Render URL from step 1. Deploy. (Or with the CLI: `npx vercel link`, `npx vercel env add VITE_WS_URL production`, `npx vercel --prod`.)
3. Share the Vercel URL. Invite links (`?room=CODE`) work on it; all games run through the Render server.

If you change the server URL later, update `VITE_WS_URL` in Vercel and redeploy — it is baked in at build time.

## Option B — Render only (free, no CLI, one service)

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

## Option C — Fly.io

```bash
brew install flyctl
fly auth login
fly launch --copy-config --yes
```
`fly.toml` is already configured; the URL is `https://sequence-online.fly.dev` (change `app` if taken).

## Option D — Any VPS / your own machine

```bash
npm ci && npm run build
PORT=80 npm start
```
Put it behind HTTPS (Caddy or nginx with WebSocket upgrade on `/ws`) so browsers allow `wss://`.
