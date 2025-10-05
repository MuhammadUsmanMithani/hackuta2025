const API_URL = "http://localhost:8080/query";
const DATA_PATH = {
	degreePlan: "data/degree.json",
	scheduleOptions: "data/schedule.json",
	professors: "data/professors.json",
};

const REQUIRED_KEYS = ["degreePlan", "scheduleOptions", "professors"];
const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABEL = {
	sun: "Sun",
	mon: "Mon",
	tue: "Tue",
	wed: "Wed",
	thu: "Thu",
	fri: "Fri",
	sat: "Sat",
};

const chatLog = document.getElementById("chatLog");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const calendarContainer = document.getElementById("calendarContainer");

if (!chatLog || !messageInput || !sendButton || !calendarContainer) {
	console.warn("advisor:chat", "Required DOM nodes missing");
}

function redirect(path) {
	window.location.replace(path);
}

function ensureAuth() {
	if (localStorage.getItem("loggedIn") !== "1") {
		redirect("index.html");
		return false;
	}
	const setup = localStorage.getItem("setup");
	if (!setup) {
		redirect("setup.html");
		return false;
	}
	return setup;
}

const setupData = ensureAuth();
if (!setupData) {
	throw new Error("Routing to login/setup");
}

const knowledgeCache = {};

async function loadKnowledge() {
	const entries = Object.entries(DATA_PATH);
	await Promise.all(
		entries.map(async ([key, url]) => {
			try {
				const response = await fetch(url);
				if (!response.ok) {
					throw new Error(`Failed to load ${url}`);
				}
				const text = await response.text();
				knowledgeCache[key] = text;
			} catch (error) {
				console.error("advisor:data", error);
				knowledgeCache[key] = "";
			}
		})
	);

	// Ensure all keys exist as empty strings
	REQUIRED_KEYS.forEach((key) => {
		if (!(key in knowledgeCache)) {
			knowledgeCache[key] = "";
		}
	});
}

function sanitize(text) {
	return text.replace(/[&<>]/g, (char) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
	})[char] ?? char);
}

function renderMarkdown(text) {
	const safe = sanitize(text);
	const lines = safe.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
	return lines
		.map((block) => {
			if (block.startsWith("- ") || block.startsWith("* ")) {
				const items = block.split(/\n/)
					.map((line) => line.replace(/^[-*]\s*/, ""))
					.map((line) => `<li>${line}</li>`) // sanitized already
					.join("");
				return `<ul>${items}</ul>`;
			}
			let html = block
				.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
				.replace(/\*(.*?)\*/g, "<em>$1</em>");
			html = html.replace(/\n/g, "<br>");
			return `<p>${html}</p>`;
		})
		.join("");
}

function appendMessage(role, content) {
	const bubble = document.createElement("article");
	bubble.className = "chat-message";
	bubble.dataset.role = role;
	if (role === "assistant") {
		bubble.innerHTML = renderMarkdown(content);
	} else {
		bubble.textContent = content;
	}
	chatLog.append(bubble);
	chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: "smooth" });
}

let typingIndicator;

function showTyping() {
	typingIndicator = document.createElement("div");
	typingIndicator.className = "typing-indicator";
	typingIndicator.setAttribute("role", "status");
	typingIndicator.innerHTML = `<span></span><span></span><span></span>`;
	chatLog.append(typingIndicator);
	chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: "smooth" });
}

function hideTyping() {
	typingIndicator?.remove();
	typingIndicator = null;
}

function setComposerDisabled(disabled) {
	messageInput.disabled = disabled;
	sendButton.disabled = disabled;
}

function parseTime(value) {
	const [hours = "0", minutes = "0"] = String(value).split(":");
	return Number.parseInt(hours, 10) * 60 + Number.parseInt(minutes, 10);
}

function formatTime(minutes) {
	const hrs = Math.floor(minutes / 60);
	const mins = minutes % 60;
	return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function detectConflicts(events) {
	const eventsByDay = new Map();
	events.forEach((event) => {
		if (!eventsByDay.has(event.day)) {
			eventsByDay.set(event.day, []);
		}
		eventsByDay.get(event.day).push(event);
	});

	let conflictFound = false;
	eventsByDay.forEach((list) => {
		list.sort((a, b) => a.start - b.start);
		for (let i = 0; i < list.length; i += 1) {
			const current = list[i];
			const next = list[i + 1];
			if (next && current.end > next.start) {
				current.conflict = true;
				next.conflict = true;
				conflictFound = true;
			}
		}
	});
	return conflictFound;
}

function renderCalendar(schedule = {}) {
	const events = [];
	DAY_ORDER.forEach((day) => {
		const entries = schedule[day];
		if (!Array.isArray(entries)) return;
		entries.forEach((entry) => {
			const start = parseTime(entry.from);
			const end = parseTime(entry.to);
			if (Number.isNaN(start) || Number.isNaN(end) || start >= end) return;
			events.push({
				day,
				start,
				end,
				course: entry.course,
				title: entry.title ?? "",
				prof: entry.prof ?? entry.professor ?? "",
			});
		});
	});

	if (!events.length) {
		calendarContainer.innerHTML = `<p class="field-description">Ask the advisor for a schedule suggestion to see it here.</p>`;
		return;
	}

	const minStart = events.reduce((min, event) => Math.min(min, event.start), Number.POSITIVE_INFINITY);
	const maxEnd = events.reduce((max, event) => Math.max(max, event.end), 0);
	const calendarStart = Math.floor(minStart / 30) * 30;
	const calendarEnd = Math.ceil(maxEnd / 30) * 30;
	const slots = [];
	for (let time = calendarStart; time < calendarEnd; time += 30) {
		slots.push(time);
	}

	const conflictFound = detectConflicts(events);

	const shell = document.createElement("div");
	shell.className = "calendar-shell";

	const header = document.createElement("div");
	header.className = "calendar-header";
	DAY_ORDER.forEach((day) => {
		const cell = document.createElement("div");
		cell.textContent = DAY_LABEL[day];
		header.append(cell);
	});
	shell.append(header);

	const grid = document.createElement("div");
	grid.className = "calendar-grid";
	grid.style.setProperty("--slot-height", "48px");

	slots.forEach(() => {
		DAY_ORDER.forEach(() => {
			const cell = document.createElement("div");
			cell.className = "time-cell";
			grid.append(cell);
		});
	});

	events.forEach((event) => {
		const dayIndex = DAY_ORDER.indexOf(event.day) + 1;
		if (dayIndex <= 0) return;
		const startRow = Math.floor((event.start - calendarStart) / 30) + 1;
		const endRow = Math.ceil((event.end - calendarStart) / 30) + 1;
		const block = document.createElement("div");
		block.className = "calendar-event";
		if (event.conflict) {
			block.dataset.conflict = "true";
		}
		block.style.gridColumn = `${dayIndex}`;
		block.style.gridRow = `${startRow} / ${endRow}`;
		block.innerHTML = `
			<strong>${sanitize(event.course ?? "Course")}</strong>
			<span>${sanitize(event.title || "").replace(/\n/g, " ")}</span>
			<span>${sanitize(event.prof || "")}</span>
			<span>${formatTime(event.start)} - ${formatTime(event.end)}</span>
		`;
		block.setAttribute("aria-label", `${event.course} from ${formatTime(event.start)} to ${formatTime(event.end)}`);
		grid.append(block);
	});

	shell.append(grid);

	calendarContainer.innerHTML = "";
	if (conflictFound) {
		const warning = document.createElement("div");
		warning.className = "conflict-banner";
		warning.textContent = "Conflicts detected. Consider asking for alternate sections or adjusting days.";
		calendarContainer.append(warning);
	}
	calendarContainer.append(shell);
}

async function sendMessage(message) {
	setComposerDisabled(true);
	appendMessage("user", message);
	showTyping();

	const payload = {
		user: setupData,
		knowledge: {
			scheduleOptions: knowledgeCache.scheduleOptions ?? "",
			professors: knowledgeCache.professors ?? "",
			degreePlan: knowledgeCache.degreePlan ?? "",
		},
		message,
	};

	try {
		const response = await fetch(API_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		if (!response.ok) {
			throw new Error(`Backend responded ${response.status}`);
		}
		const data = await response.json();
		hideTyping();
		appendMessage("assistant", data.message ?? "I ran into trouble but I'm here.");
		if (data.schedule) {
			renderCalendar(data.schedule);
		}
	} catch (error) {
		console.error("advisor:chat", error);
		hideTyping();
		appendMessage(
			"assistant",
			"I could not reach the advisor service just now. Please check the backend server and try again."
		);
	} finally {
		setComposerDisabled(false);
		messageInput.focus();
	}
}

function handleSend() {
	const message = messageInput.value.trim();
	if (!message) return;
	messageInput.value = "";
	sendMessage(message);
}

sendButton.addEventListener("click", handleSend);
messageInput.addEventListener("keydown", (event) => {
	if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
		event.preventDefault();
		handleSend();
	}
});

function greetUser() {
	appendMessage(
		"assistant",
		"Hi there! Tell me what courses you want to explore, the kind of professor vibes you prefer, or just say \"build me a balanced schedule\" to get started."
	);
}

loadKnowledge().then(() => {
	greetUser();
}).catch((error) => {
	console.error("advisor:data", error);
	greetUser();
});
