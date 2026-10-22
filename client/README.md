# StudyMate frontend

Responsive React + Vite frontend for StudyMate AI. It includes the overview, AI tutor, notes summarizer, quiz maker, and saved-history screens. The tutor, summarizer, and quiz maker use the Express API. Generated summaries and quizzes are saved in browser local storage; no sample history is preloaded.

From this directory:

- `npm install` installs dependencies.
- `npm run dev` starts Vite.
- `npm test` runs the screen and interaction tests.
- `npm run build` creates the production bundle in `dist/`.

The API defaults to `http://localhost:3000`. Set `VITE_API_BASE_URL` in a client `.env` only when the backend runs at a different URL. Never put Gemini keys in client environment variables.
