# StudyMate AI

StudyMate AI is a React + Vite study workspace with an Express API for AI chat, note summaries, and quizzes. Signed-in users can save summaries and completed quiz results to a private Supabase Postgres history.

## Requirements

- Node.js 22.12 or newer
- npm
- A Supabase project for account-based persistent history (optional for local demo mode)

## Configure Supabase history

1. In the Supabase SQL Editor, run [`supabase/migrations/20261022000000_study_items.sql`](supabase/migrations/20261022000000_study_items.sql). The table enables row-level security and limits every row to its owner.
2. Copy `server/.env.example` to `server/.env`. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the Supabase project API settings. Keep Gemini credentials in this server-only file too.
3. Copy `client/.env.example` to `client/.env`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the same project URL and anon/publishable key. `VITE_API_BASE_URL` should point to the Express API.
4. In Supabase Auth settings, enable Email auth and set the local redirect/site URL as needed. If email confirmations are enabled, a new account must confirm its email before signing in.

When Supabase is configured, AI generation endpoints also require a verified signed-in user. The API limits a client to 20 combined AI requests per minute by default; adjust `AI_RATE_LIMIT_PER_MINUTE` for the deployment. Set `CORS_ORIGINS` to the exact frontend origin(s). If the API runs behind a trusted reverse proxy, set `TRUST_PROXY_HOPS` to its exact hop count so client IP rate limits use the real address; leave it at `0` otherwise.

The anon/publishable key is intended for browser use; database policies enforce the data boundary. Never use a Supabase service-role key in the client or in a `VITE_*` variable. The Express API validates each bearer token with Supabase Auth and calls PostgREST with that same user token, so database RLS also applies to backend requests.

## Run locally

Install and start the frontend:

```powershell
cd client
npm install
npm run dev
```

In another terminal, configure and start the API:

```powershell
Copy-Item server/.env.example server/.env
cd server
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). The API health check is `http://localhost:3000/api/health`.

Without Supabase browser settings, the UI runs in demo history mode and stores saved items in this browser only. With settings, sign in or create an account to load and save persistent history. The database schema must be applied before saving.

## API contracts

AI endpoints return demo content when no Gemini key is configured. With Supabase configured they require a valid signed-in user's access token:

- `POST /api/chat` — `{ "message": "Explain photosynthesis", "history": [] }` → `{ "answer": "..." }`
- `POST /api/summaries` — `{ "title": "Biology", "notes": "..." }` → `{ "title", "sourceText", "content": { "lead", "points", "takeaway" } }`
- `POST /api/quizzes` — `{ "topic": "Photosynthesis", "questionCount": 5 }` → `{ "title", "questions": [...] }`

AI and history endpoints require `Authorization: Bearer <Supabase access token>` when Supabase is configured. History endpoints always require a configured Supabase project:

- `GET /api/study-items` → `{ "items": [...] }`
- `POST /api/study-items` summary → `{ "type": "summary", "title", "sourceText", "content": { "lead", "points", "takeaway" } }`
- `POST /api/study-items` quiz → `{ "type": "quiz", "title", "questions": [...], "score": "4 / 5" }`

Errors use `{ "error": { "code", "message" } }`. History routes return 401 for missing or invalid sessions, 400 for invalid items, and 503 for missing Supabase configuration or unavailable auth/database services.

## Tests and build

```powershell
cd client
npm test
npm run build

cd ..\server
npm test
```

The server API tests exercise valid history reads/writes, invalid payloads, missing/invalid sessions, unconfigured Supabase, and database failures using deterministic HTTP mocks. Set Supabase project credentials and apply the migration to verify a live account/database connection.
