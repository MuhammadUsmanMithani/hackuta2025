# best practices

## general web
- favor progressive enhancement and resilient layouts
- keep html semantic and minimal
- isolate concerns: html for structure, css for appearance, js for behavior
- avoid over‑engineering, no build step required for mvp

## accessibility
- use real buttons and labels, never `div` controls
- ensure 4.5:1 text contrast in both themes (except large display text 3:1)
- support keyboard: tab order, `:focus-visible`, `Enter` and `Space` on buttons
- `aria-live="polite"` region for streaming chatbot responses
- announce theme changes via `aria-live`
- provide reduced motion: respect `prefers-reduced-motion: reduce`
- form inputs have `aria-describedby` for helper text and error messages

## responsiveness
- mobile-first css with fluid units and min/max clamp
- css grid for the calendar, flexbox for chat rows
- avoid fixed heights; use `min()` and `max()` to bound components
- keep tap targets ≥ 44×44 px

## animations
- durations: 150–220ms for taps, 220–380ms for transitions, 40–60ms stagger
- use transforms and opacity only
- avoid layout‑thrashing properties like top/left without transforms
- debounce scroll/resize handlers to ≤ 60fps
- when streaming text, append in chunks and requestAnimationFrame for smoothness

## performance
- ship a single `styles.css` and small page‑specific js files
- lazy‑load large json data when chatbot first needs it
- cache json in memory in the backend for fast responses
- compress backend responses with gzip
- set appropriate cache headers for static assets
- use `will-change: transform` sparingly before entering animations
- avoid long main‑thread tasks, break work into microtasks

## backend
- prefer FastAPI or Flask with uvicorn/gunicorn for dev
- validate incoming payloads with pydantic or marshmallow
- time out upstream llm calls and return graceful errors
- load local json files once and reuse
- never block the event loop while waiting on the llm

## documentation
- keep `README.md` as source of truth for setup and run
- include example `.env.example` with `GEMINI_API_KEY=` placeholder
- document `localStorage` keys and json schema in `/frontend/data/SCHEMA.md`
- include an “assumptions and limits” section

## ui coding patterns
- use css variables for colors, spacing, radii, and glows
- implement theme with `data-theme="light|dark"` on `<html>`
- read `prefers-color-scheme` once, then persist user overrides
- break js into small modules:
  - `sso.js` for login simulation
  - `setup.js` for form building, validation, and storage
  - `chatbot.js` for chat io, animations, and calendar rendering
  - `theme.js` for theme events and persistence

## error handling
- show inline, human messages for validation and network errors
- keep logs in the console with consistent prefixes
- retry transient network errors with exponential backoff once

## testing checklist
- new vs returning user routing
- setup form validation and persistence
- theme detection and toggle
- chat send, loading state, and streaming animation
- backend 200 and error paths
- calendar collision highlighting
