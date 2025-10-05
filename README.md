# AI Academic Advisor — UTA Instance

Minimalist brutalist web experience that simulates a Microsoft SSO sign-in, collects student preferences, and chats with an AI advisor backed by Gemini `gemini-2.5-flash`. Local JSON files stand in for real campus systems so the entire project runs offline.

## Quick start

### 1. Backend (Flask + Gemini)

```pwsh
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m flask --app server:app run --port 8080 --debug
```

*Without an API key the backend falls back to a deterministic planner so the UI stays functional.*

### 2. Frontend (static files)

Any static file server works. Two easy options:

```pwsh
# option 1: Python http.server
cd frontend
python -m http.server 4173

# option 2: VS Code Live Server extension (recommended for HMR)
```

Open `http://localhost:4173/index.html` (or the host/port supplied by your server).

## Experience walkthrough

1. **Index (`index.html`)** – Minimal landing with “Student SSO Sign-In”. Clicking launches a faux Microsoft popup, then stores `localStorage.loggedIn = "1"` and routes to setup.
2. **Setup (`setup.html`)** – One-time preference capture (interests tag input, credit target, preferred days, time windows, elective interests, graduation term). Successful submission sets `localStorage.setup` and moves to the advisor.
3. **Advisor (`advisor.html`)** – Chat UI streams responses, animates bubbles, and renders a weekly calendar grid when the backend responds with a schedule payload.
4. **Settings (`settings.html`)** – Loads the saved setup payload for editing. Changes persist immediately.

Theme toggles live in the header on every page. We auto-detect `prefers-color-scheme`, persist `localStorage.theme`, and announce changes via `aria-live`.

## Backend behavior

- **Endpoint:** `POST http://localhost:8080/query`
- **Request shape:**

```jsonc
{
	"user": "<stringified localStorage.setup payload>",
	"knowledge": {
		"scheduleOptions": "<schedule.json as string>",
		"professors": "<professors.json as string>",
		"degreePlan": "<degree.json as string>"
	},
	"message": "What advanced AI electives should I take?"
}
```

- **Response shape:**

```jsonc
{
	"message": "Markdown-safe assistant reply",
	"schedule": {
		"mon": [
			{ "from": "13:00", "to": "14:20", "course": "CSE-4317", "title": "Machine Learning", "prof": "Priya Patel" }
		]
	},
	"debug": { "provider": "gemini" }
}
```

When `GEMINI_API_KEY` is missing or the SDK errors, the adapter returns a deterministic fallback schedule grounded in the same JSON data so flows stay testable.

### Data flow diagram (text)

```
Student Browser
	├─ Loads index/setup/advisor from /frontend assets
	├─ Fetches degree/schedule/professor JSON locally
	├─ Sends POST /query → FastAPI backend
Backend (FastAPI)
	├─ Validates request payload with Pydantic
	├─ Builds Gemini prompt using local JSON content
	├─ Calls gemini-2.5-flash (or offline fallback)
	└─ Returns { message, schedule? }
```

## Data fixtures

All development data lives in `/frontend/data`.

- `degree.json` – Catalog year, core courses, electives, prerequisites, and pacing notes.
- `schedule.json` – Next-term sections with day/time/building, seat availability, and professor id.
- `professors.json` – Professor ratings, difficulty, grade tilt, and notes.
- `SCHEMA.md` – Detailed schema documentation and sample payloads.

## `localStorage` contract

| Key | Type | Description |
| --- | --- | --- |
| `loggedIn` | string (`"1"`) | Set after simulated Microsoft sign-in. Triggers redirects on subsequent visits. |
| `setup` | stringified JSON | Student preferences captured by `setup.js`. Shared with backend in the `user` field. |
| `theme` | `"light" \| "dark"` | Optional override of system theme. Persisted when the header toggle is used. |

## Accessibility & design choices

- Minimalist brutalist aesthetic with soft glows using CSS custom properties.
- Theme aware surfaces, border treatments, and responsive fluid layout (no bundler required).
- Keyboard support: real buttons, focus-visible rings, 44×44px targets.
- `aria-live="polite"` for chat stream and theme announcements.
- Animations respect `prefers-reduced-motion` and keep to transforms/opacity.

## Troubleshooting

- **CORS errors:** Confirm the backend is running on `http://localhost:8080` and that your static server uses an allowed origin (any localhost port). The FastAPI app enables CORS for `localhost:*`.
- **Gemini auth failures:** Ensure `GEMINI_API_KEY` is valid. The fallback still answers but will mention offline mode.
- **Stale data:** Clear `localStorage` in DevTools or run `localStorage.clear()` in the console to simulate a first-time student.

Happy advising! 🎓
