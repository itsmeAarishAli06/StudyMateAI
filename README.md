# StudyMate AI

StudyMate AI is a React + Vite study workspace with an Express API for AI chat, note summaries, quizzes, and personal study plans. Signed-in users can save summaries, quiz results, and editable exam schedules to a private Supabase Postgres history.

## Requirements

- Node.js 22.13 or newer
- npm
- A Supabase project for account-based persistent history (optional for local demo mode)

## Configure Supabase history

1. In the Supabase SQL Editor, run [`supabase/migrations/20261022000000_study_items.sql`](supabase/migrations/20261022000000_study_items.sql), [`supabase/migrations/20261024000000_study_plans.sql`](supabase/migrations/20261024000000_study_plans.sql), [`supabase/migrations/20261024120000_ai_daily_quotas.sql`](supabase/migrations/20261024120000_ai_daily_quotas.sql), [`supabase/migrations/20261025100000_ai_daily_limit_30.sql`](supabase/migrations/20261025100000_ai_daily_limit_30.sql), [`supabase/migrations/20261028120000_exam_preparation.sql`](supabase/migrations/20261028120000_exam_preparation.sql), [`supabase/migrations/20261028130000_exam_question_limit_15.sql`](supabase/migrations/20261028130000_exam_question_limit_15.sql), and [`supabase/migrations/20261028140000_exam_settings.sql`](supabase/migrations/20261028140000_exam_settings.sql), in that order. The migrations enable row-level security and restrict account data to its owner.
2. Copy `server/.env.example` to `server/.env`. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the Supabase project API settings. Keep Gemini credentials in this server-only file too.
3. Copy `client/.env.example` to `client/.env`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the same project URL and anon/publishable key. `VITE_API_BASE_URL` should point to the Express API.
4. In Supabase Auth settings, enable Email auth and set the local redirect/site URL as needed. If email confirmations are enabled, a new account must confirm its email before signing in.

AI generation requires a verified account in production and is capped at 30 requests per account per UTC day across chat, summaries, quizzes, and mock exam generation. The database atomically enforces this cap, so concurrent requests and app restarts cannot reset or overrun an account's allowance. Each mock exam generation counts once, whether it creates 5 or 15 questions. Apply the quota migrations before deploying this feature; if Supabase usage checks fail, AI generation fails closed. Set `NODE_ENV=production` in the deployed backend environment so missing Supabase quota configuration cannot disable enforcement. The signed-in profile dropdown shows requests used and remaining. The API also limits a client to 20 combined AI requests per minute by default; adjust `AI_RATE_LIMIT_PER_MINUTE` for the deployment. Set `CORS_ORIGINS` to the exact frontend origin(s). If the API runs behind a trusted reverse proxy, set `TRUST_PROXY_HOPS` to its exact hop count so client IP rate limits use the real address; leave it at `0` otherwise.

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

Without Supabase browser settings, the UI runs in demo mode and stores saved history, study plans, and exam attempts in this browser only. With settings, sign in or create an account to save them to Supabase and use per-account AI quotas. Apply all migration scripts before using persistent study plans, history, exam attempts, and AI usage tracking.

The Summarizer and Quiz Maker accept PDF, TXT, and Markdown files up to 10 MB. PDF text is extracted in your browser; scanned image-only PDFs need OCR and are not supported. Extracted text is limited to 12,000 characters, matching the AI API input limit.

The Study Planner builds a daily schedule from an exam date, available study minutes, and topic list. You can check off, rename, resize, add, and remove tasks, or update the plan settings. Signed-in plans are private in Supabase; demo plans stay in local browser storage.

Exam Preparation creates timed, mixed-topic MCQ mock exams from 1–15 syllabus topics and optional notes. Choose 5, 10, or 15 questions, a 1, 3, 5, 10, 15, or 20 minute timer, and Easy, Standard, or Challenging difficulty; generate another mock when you want more practice, with each generation using one daily AI request. The selected difficulty guides AI question generation. After submitting, review each correct option and its short explanation. The timer starts after generation; submitted and timed-out attempts are scored per topic, with weak areas and a focused revision plan. Signed-in attempts are saved privately in Supabase. Local demo attempts are kept in browser storage. Apply all three exam migrations before using persistent exam history with the latest settings.

## API contracts

Chat, summaries, and quizzes return demo content when no Gemini key is configured. Exam generation requires a server-side Gemini key and returns a clear error if it is missing. With Supabase configured, AI endpoints require a valid signed-in user's access token:

- `POST /api/chat` — `{ "message": "Explain photosynthesis", "history": [] }` → `{ "answer": "..." }`
- `POST /api/summaries` — `{ "title": "Biology", "notes": "..." }` → `{ "title", "sourceText", "content": { "lead", "points", "takeaway" } }`
- `POST /api/quizzes` — `{ "topic": "Photosynthesis", "questionCount": 5 }` → `{ "title", "questions": [...] }`
- `POST /api/exams` — exam details, syllabus topics, `durationMinutes` (`1 | 3 | 5 | 10 | 15 | 20`), and `difficulty` (`easy | standard | challenging`) → one timed mock exam of 5, 10, or 15 MCQs.
- `GET /api/exams` — `{ "exams": [...] }` for the signed-in user's attempts.
- `POST /api/exams/:id/submit` — `{ "answers": [0, 2, null, ...] }` → server-scored result, topic breakdown, and revision suggestions.
- `GET /api/ai-usage` → `{ "usage": { "used", "remaining", "dailyLimit", "resetsAt" } }`

AI and history endpoints require `Authorization: Bearer <Supabase access token>` when Supabase is configured. History endpoints always require a configured Supabase project:

- `GET /api/study-items` → `{ "items": [...] }`
- `POST /api/study-items` summary → `{ "type": "summary", "title", "sourceText", "content": { "lead", "points", "takeaway" } }`
- `POST /api/study-items` quiz → `{ "type": "quiz", "title", "questions": [...], "score": "4 / 5" }`

Errors use `{ "error": { "code", "message" } }`. Reaching the daily AI cap returns 429 with code `AI_DAILY_LIMIT_REACHED` and current usage in `error.details.usage`. Usage-check failures return 503 and do not call Gemini. History routes return 401 for missing or invalid sessions, 400 for invalid items, and 503 for missing Supabase configuration or unavailable auth/database services.

Study plan routes require a Supabase session when account mode is enabled: `GET /api/study-plans`, `POST /api/study-plans`, `PATCH /api/study-plans/:id`, and `DELETE /api/study-plans/:id`. Plan reads and changes are restricted by Supabase row-level security.

Quiz requests may include `difficulty: "easy" | "standard" | "challenging"`; the UI recommends a level from recent quiz scores.

## Tests and build

```powershell
cd client
npm test
npm run build

cd ..\server
npm test
```

The server API tests exercise valid history reads/writes, invalid payloads, missing/invalid sessions, unconfigured Supabase, and database failures using deterministic HTTP mocks. Set Supabase project credentials and apply the migration to verify a live account/database connection.
