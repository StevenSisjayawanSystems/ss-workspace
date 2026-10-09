# The Guildhouse

A small 3D office for a team: walk between rooms, sit down to join a room's voice or video call, chat, and share a YouTube jukebox.

## Run locally

```sh
pnpm install
pnpm dev
```

- Web app: http://localhost:5273
- Game server: port 2567 (the app finds it by itself)

`pnpm test` runs the tests; `pnpm typecheck` and `pnpm build` check and build everything.

### Accounts, locally

Sign-in, saved progress, the bulletin board and chat history live in Supabase. With Docker running:

```sh
supabase start        # API on :54521, Studio on http://127.0.0.1:54523
```

Then copy `.env.example` to `.env` and fill the four Supabase settings from what `supabase start` prints (the Project URL, the secret key for the server, the publishable key for the web app). Both the server and the web app read that one file. Without it everything still runs: people join as guests and their progress stays in their browser.

Database changes are migrations in `supabase/migrations`; `supabase migration up` applies new ones.

## Layout

| Path | What it is |
|---|---|
| `apps/web` | The browser app (Vite, React, three.js) |
| `apps/server` | The game server (Colyseus): movement, chat, seats, jukebox, call handshakes |
| `packages/shared` | Floor plan, seats, pathfinding, levels and mentions, used by both |
| `supabase` | Local Supabase settings and the database migrations |

The floor plan is data: rooms, doors and furniture live in `packages/shared/src/office.ts`.

## Deploy

Two services from this one repository. Settings are described in `.env.example`.

### 1. Game server on Railway

1. New Project, Deploy from GitHub repo, pick this repository. Railway builds the `Dockerfile` at the root.
2. Under Variables add `INVITE_CODE` and the relay settings (see below).
3. Under Settings, Networking, choose Generate Domain. If it asks for a port, enter the value of `PORT` shown in the service's variables (Railway sets it).
4. Note the domain, for example `guildhouse-production.up.railway.app`.

The deploy log should say `Invite code required to join` and `Call relay (TURN) configured`.

### 2. Web app on Vercel

1. Add New Project, import this repository. If Vercel offers a multi-service import, decline it and import the Vite app (`apps/web`) as a single project. Root Directory must be `apps/web`; `apps/web/vercel.json` supplies the build settings.
2. Add one environment variable: `VITE_SERVER_URL` = `wss://` followed by the Railway domain.
3. Deploy. Changing `VITE_SERVER_URL` later needs a redeploy, because it is built into the app.

### 3. Call relay

Without a relay, calls connect directly between browsers and fail on some office and mobile networks.

With Cloudflare: in the dashboard open Realtime, TURN Server, create a TURN key, and copy its Key ID and API token into `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` on Railway. The server exchanges them for short-lived credentials per person, so the token never reaches a browser.

Any other provider works through `TURN_URLS`, `TURN_USERNAME` and `TURN_CREDENTIAL`.

### Accounts and saved progress

1. Create a Supabase project and apply the migrations: `supabase link`, then `supabase db push`.
2. On Railway set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. The deploy log confirms with `Sign-in required`.
3. On Vercel set `VITE_SUPABASE_URL` and `VITE_SUPABASE_KEY` (the publishable key) and redeploy.

People make an account with an email and password on the title screen. Supabase asks new accounts to confirm their email by default; turn that off under Authentication, Sign In / Providers, Email if you would rather they get straight in. Only the game server writes to the database; a browser can read its own member row and nothing else.

### Keeping notes, desks and bookings

Desk claims, the meeting room schedule and everyone's Focus Garden hours are saved to small files (so is the bulletin board, when there is no Supabase). Railway's disk is wiped on every deploy, so to keep them: on the server service add a Volume mounted at `/data`, then set the variable `DATA_DIR=/data`. The deploy log confirms with `Notes are kept in /data`. If it instead warns that something could not be saved, the volume is not writable by the server's user; setting `RAILWAY_RUN_UID=0` on the service is the usual fix.

### Inviting people

Send the link with the code in the fragment, which browsers do not send to servers:

```
https://your-app.vercel.app/#invite=YOUR_CODE
```

People who open the plain address are asked for the code. To revoke access, change `INVITE_CODE` on Railway.

## Things to know

- One server process holds everything in memory. A redeploy disconnects everyone for a few seconds and clears the jukebox queue.
- Calls are browser-to-browser, one connection per pair of people seated in a room. That suits a handful per room.
- Browsers only allow the microphone and camera on `localhost` or HTTPS, so calls do not work over a plain LAN address.
