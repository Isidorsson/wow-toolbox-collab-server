# wow-toolbox-collab-server

Hocuspocus-based realtime collaboration server for [wow-toolbox-editor](../wow-toolbox-editor).
Backs Yjs clients in the Electron app so multiple users can co-edit the same
spell, DBC table, or map tile in realtime.

## Stack

- **Runtime:** [Bun](https://bun.sh) (Node-compatible, faster cold start)
- **Server:** [`@hocuspocus/server`](https://tiptap.dev/docs/hocuspocus) — Yjs WebSocket server with extension API
- **Persistence:** Supabase Postgres (`yjs_documents` table, binary blob per doc)
- **Auth:** Supabase JWT verified offline with the project JWT secret (HS256, via `jose`)
- **Deploy target:** [Railway](https://railway.app) (hobby plan, ~$0/mo at 10 concurrent users)

## Architecture

```
┌─────────────────┐    WebSocket (wss)   ┌──────────────────────┐
│ Electron client │ ───────────────────► │  Hocuspocus server   │
│ (HocuspocusProv)│ ◄─────────────────── │  (this repo)         │
└─────────────────┘                      └──────────┬───────────┘
                                                    │
                                          REST + service-role key
                                                    │
                                                    ▼
                                         ┌────────────────────┐
                                         │ Supabase Postgres  │
                                         │  yjs_documents     │
                                         └────────────────────┘
```

- Client opens one `HocuspocusProvider` per Y.Doc.
- Server runs `onAuthenticate` first — verifies the Supabase access token, rejects on failure.
- On first connection to a doc, server calls `fetch(docName)` from Postgres. `null` → fresh empty doc.
- On debounced updates and on doc unload, server calls `store(docName, state)` to persist.
- Awareness (cursors, presence) is ephemeral and never persisted.

## Doc name convention

```
project:{projectId}:{tool}:{entityId}
```

Examples:

| Tool          | Example doc name                          |
| ------------- | ----------------------------------------- |
| Spell editor  | `project:abc:spell:25`                    |
| DBC table     | `project:abc:dbc:Spell.dbc`               |
| Map tile      | `project:abc:map:tile_32_48`              |
| Project root  | `project:abc:root`                        |

Set `ALLOWED_DOC_PREFIXES=project:` to reject anything outside this scheme.

## Local development

```sh
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET

bun install
bun run dev
```

Server listens on `ws://localhost:1234`.

Run the migration in Supabase SQL editor once:

```sh
# migrations/001_yjs_documents.sql
```

## Deploy to Railway

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**.
3. Add env vars under **Variables**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_JWT_SECRET`
   - `ALLOWED_DOC_PREFIXES=project:` (optional but recommended)
   - `LOG_LEVEL=info`
4. Under **Settings → Networking**, click **Generate Domain**.
5. Note the resulting domain — use it in the Electron client as `wss://<domain>`.

Railway injects `PORT` automatically. Nixpacks picks up `nixpacks.toml` and runs Bun.

## Client wiring (in wow-toolbox-editor)

```ts
import { HocuspocusProvider } from "@hocuspocus/provider";
import * as Y from "yjs";

const ydoc = new Y.Doc();
const provider = new HocuspocusProvider({
  url: import.meta.env.VITE_COLLAB_WS_URL, // wss://collab-yourapp.up.railway.app
  name: `project:${projectId}:spell:${spellId}`,
  document: ydoc,
  token: supabaseAccessToken, // from supabase.auth.getSession()
});

// React to remote updates:
ydoc.getMap("spell").observe((event) => { /* update UI */ });

// Make a local edit:
ydoc.getMap("spell").set("Name", "Fireball");
```

Add `y-indexeddb` on the client for offline support — edits queue locally and sync when the WebSocket reconnects.

## Notes

- No RLS on `yjs_documents` — server uses the service role key and enforces auth at the WebSocket layer.
- The `onAuthenticate` hook currently accepts any valid Supabase JWT. When project membership lands, extend `verifySupabaseToken` to also check `project_members` (or whatever the membership table is called) for the project encoded in `documentName`.
- Hocuspocus debounces persistence writes — default is 2s after the last change. Tune via `Database` extension options if needed.
