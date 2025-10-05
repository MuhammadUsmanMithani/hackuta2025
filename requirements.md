# ai academic advisor — uta instance

<!-- base scope, minimal viable features, narrow focus, -->
<!-- use local json now, replace with real systems later, -->
<!-- lowercase comments only, commas allowed, -->

## purpose
build a frontend + python backend ai advisor that reads structured json for uta degree data, professor ratings, and next‑term schedules, then helps students plan classes, check prerequisites, and visualize schedules while honoring personal preferences saved in localstorage

## user goals
- sign in with simulated microsoft sso
- complete a one‑time setup of preferences
- ask the chatbot for schedule and degree advice
- view a suggested weekly calendar with classes and professors
- edit preferences any time in settings

## pages
1) **index.html**
   - minimalist landing with “student sso sign‑in”
   - click opens a popup for ~600ms then closes to simulate mfa
   - on success sets `localStorage.loggedIn = "1"` and redirects to `setup.html`
   - on subsequent visits, if `loggedIn` is present, auto‑redirect to `setup.html`

2) **setup.html**
   - if `localStorage.setup` exists, redirect to `chatbot.html`
   - otherwise render a progressive form in this order:
     - major, minor, or concrete target classes
     - total credits desired per semester
     - preferred class days
     - time blocks per day, with quick presets like noon‑5, evening‑only
     - interest areas for electives via pill buttons
     - expected graduation term including summer
   - on submit, store serialized json to `localStorage.setup` then redirect `chatbot.html`

3) **settings.html**
   - loads saved `localStorage.setup` values
   - allows editing any field
   - writes updates back to `localStorage.setup`

4) **chatbot.html**
   - minimal chat ui with theme‑aware blue/orange glow accents
   - shows user bubbles on right, ai bubbles on left
   - streaming/typing animation for ai replies
   - a “render calendar” panel below chat when a response contains a schedule payload
   - calendar uses css grid for days x time blocks
   - top‑left theme switcher on every page

## design system
- minimalist brutalist, but soft enough for daily reading
- responsive fluid layout for mobile and desktop
- color: neutral surfaces, subtle blue and orange glows, avoid hard contrasts
- motions: 150–220ms ease for taps, 220–380ms for page transitions, stagger chat items by 40–60ms
- typography: system ui stack
- theme: auto detect via `prefers-color-scheme`, plus toggle persisted in `localStorage.theme`

## localstorage contract
- `loggedIn: "1"` after simulated sso
- `setup: <json string>` user preferences
- `theme: "light" | "dark"` optional override

## backend
- python server at `http://localhost:8080/query`
- loads local json files as knowledge base during development
- forwards a structured prompt to gemini `gemini-2.5-flash`
- reads api key from `.env` as `GEMINI_API_KEY`
- responds with json: `{ message, schedule?, citations?, debug? }`

## data inputs to ai (all as json strings)
- **next‑term schedule options**: course sections with days, start, end, building, professor id, capacity
- **ratemyprofessors summary**: professor id, name, rating, grade‑friendliness, difficulty, notes
- **degree plan + prerequisites**: course id, title, credits, prereq list, catalog year rules
- **student setup** from localstorage

## baseline json shapes
```jsonc
// student setup
{
  "student": {
    "name": "optional",
    "id": "optional",
    "gpa": 3.4,
    "majorGpa": 3.6
  },
  "preferences": {
    "major": "bs cs",
    "minor": "math",
    "targetClasses": ["cse-3310", "math-2326"],
    "credits": 15,
    "days": ["mon","wed","fri"],
    "timeBlocks": {
      "mon": [{"from": "12:00", "to": "17:00"}],
      "tue": [{"from": "15:00", "to": "20:00"}]
    },
    "interests": ["art appreciation", "entrepreneurship"],
    "expectedGrad": "spring 2027"
  },
  "transferredCredits": [
    {"course": "english comp i", "credits": 3}
  ]
}
```

```jsonc
// degree data
{
  "catalogYear": "2025-2026",
  "plan": [
    {"id": "cse-1310", "title": "intro to programming", "credits": 3, "prereqs": []},
    {"id": "cse-1320", "title": "intermediate programming", "credits": 3, "prereqs": ["cse-1310"]}
  ]
}
```

```jsonc
// professor ratings
[
  {"profId": "p001", "name": "doe", "rating": 4.7, "gradeTilt": "lenient", "difficulty": 2.8},
  {"profId": "p002", "name": "lee", "rating": 3.9, "gradeTilt": "average", "difficulty": 3.4}
]
```

```jsonc
// next term sections
[
  {
    "courseId": "cse-1320",
    "section": "001",
    "profId": "p001",
    "days": ["mon","wed"],
    "start": "13:00",
    "end": "14:20",
    "building": "nh 100",
    "seats": {"cap": 40, "open": 12}
  }
]
```

## logic flow
1. **index** → simulate sso → set `loggedIn`
2. **setup** → collect and save `setup` or skip to **chatbot** if present
3. **chatbot** on load:
   - fetch degree, schedule options, professor ratings from local json files
   - load `setup` from localstorage
   - send all to backend as strings
   - render ai reply, and if a `schedule` object is returned, draw the calendar
4. **settings** edits update `setup` and the chatbot picks changes on next load

## api contract
- **request**
```json
{
  "user": "<raw setup json string>",
  "knowledge": {
    "scheduleOptions": "<json string>",
    "professors": "<json string>",
    "degreePlan": "<json string>"
  },
  "message": "free form user question"
}
```
- **response**
```json
{
  "message": "assistant reply markdown or text",
  "schedule": {
    "mon": [{"from":"13:00","to":"14:20","course":"cse-1320","prof":"doe"}]
  }
}
```

## calendar rendering rules
- 7 columns sun‑sat
- rows are 30‑minute increments between earliest and latest class in suggested plan
- blocks display course id, short title, professor name
- collisions highlight in warning color and surface a list above the grid

## constraints
- frontend must work without bundlers, plain html css js
- no external ui frameworks required, can use small utilities if needed
- animations must be gpu friendly

## minimum system requirements
- modern chromium, firefox, or safari with es6 and css grid
- python 3.11+, `pip install -r requirements.txt`
- env var `GEMINI_API_KEY` set
- port 8080 available

## files and directories
```
/frontend
  index.html
  setup.html
  settings.html
  chatbot.html
  /assets
    styles.css
    theme.js
    chatbot.js
    setup.js
    settings.js
    sso.js
  /data
    degree.json
    schedule.json
    professors.json

/backend
  server.py
  adapter_gemini.py
  .env.example
  requirements.txt

README.md
```

## component interactions
- **theme switcher** emits `themechange` event, theme.js writes to localstorage, all pages read on load
- **chatbot** uses `chatbot.js` to manage message queue, fetch backend, handle streaming animations
- **backend** reads json files from `/frontend/data` on request, or caches them at startup

## security notes
- simulated sso is a demo only
- lock down cors to localhost during development
- never send secrets to the client

## acceptance criteria
- new user hits index → setup → chatbot flow works end‑to‑end
- returning user skips index automatically
- editing settings persists and affects next chatbot load
- backend returns ai text, and when schedule exists it is rendered as a calendar
- theme detection and toggling works and is persisted
