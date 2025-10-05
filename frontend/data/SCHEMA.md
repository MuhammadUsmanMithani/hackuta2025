# Data Schemas

This MVP relies on local JSON fixtures to simulate production systems. Each file is loaded by the frontend and forwarded to the Gemini prompt in the backend.

## `degree.json`

```jsonc
{
	"catalogYear": "2025-2026",
	"degree": "BS Computer Science",
	"totalCredits": 120,
	"coreCourses": [
		{
			"id": "CSE-1320",
			"title": "Intermediate Programming",
			"credits": 3,
			"prerequisites": ["CSE-1310"]
		}
	],
	"advancedElectives": [ /* same shape as coreCourses */ ],
	"mathScienceSupport": [ /* same shape as coreCourses */ ],
	"notes": ["Text notes about pacing, grade requirements, etc."]
}
```

## `schedule.json`

```jsonc
[
	{
		"courseId": "CSE-1320",
		"courseTitle": "Intermediate Programming",
		"section": "001",
		"days": ["mon", "wed"],
		"start": "09:30",
		"end": "10:50",
		"building": "NH",
		"room": "114",
		"profId": "p001",
		"capacity": 45,
		"openSeats": 7
	}
]
```

* `days` aligns with lowercase three-letter keys used throughout the UI (`mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`).
* Times are 24-hour strings (`HH:mm`).

## `professors.json`

```jsonc
[
	{
		"profId": "p001",
		"name": "Jamie Doe",
		"rating": 4.7,
		"gradeTilt": "lenient",
		"difficulty": 2.4,
		"notes": "Hands-on labs, lots of feedback on projects"
	}
]
```

* `rating` is 1–5.
* `difficulty` is 1 (easiest) – 5 (hardest).
* `gradeTilt` is a friendly descriptor the assistant can reuse in summaries.

## `localStorage.setup` payload

Saved after the setup form completes. The same shape is forwarded to the backend.

```jsonc
{
	"student": {
		"interests": ["CSE 3311", "Math Minor"],
		"credits": 15,
		"preferredDays": ["mon", "wed"],
		"timeBlocks": {
			"mon": [{ "from": "09:00", "to": "15:00" }],
			"wed": [{ "from": "09:00", "to": "15:00" }]
		},
		"electives": ["ai", "data"],
		"gradTerm": "fall-2026"
	},
	"savedAt": "2025-09-01T12:00:00.000Z"
}
```

The backend reads this value verbatim in the `user` field of the Gemini prompt payload.
