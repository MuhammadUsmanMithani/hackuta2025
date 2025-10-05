const STORAGE_KEY = "setup";
const LOGGED_KEY = "loggedIn";

const page = document.body.dataset.page;
const isSetupPage = page === "setup";

const form = document.querySelector("form");
const tagsContainer = document.getElementById("majorTags");
const tagInput = document.getElementById("majorInput");
const creditsInput = document.getElementById("creditsInput");
const dayCheckboxes = Array.from(document.querySelectorAll(".day-option input[type=checkbox]"));
const timeBlocksRoot = document.getElementById("timeBlocks");
const presetButtons = Array.from(document.querySelectorAll(".preset-button[data-preset]"));
const electiveButtons = Array.from(document.querySelectorAll(".pill-option"));
const gradSelect = document.getElementById("gradTerm");
const skipButton = document.getElementById("skipSetup");
const resetButton = document.getElementById("resetDefaults");
const stageContainer = isSetupPage ? document.getElementById("setupStages") : null;
const stages = isSetupPage ? Array.from(document.querySelectorAll(".setup-stage")) : [];
const stageDots = isSetupPage ? Array.from(document.querySelectorAll(".stage-dot")) : [];
const stageCurrentLabel = isSetupPage ? document.getElementById("stageCurrent") : null;
const stagePrevButton = isSetupPage ? document.getElementById("stagePrev") : null;
const stageNextButton = isSetupPage ? document.getElementById("stageNext") : null;
let currentStageIndex = 0;

const HIDDEN_VALIDATION_INPUT = document.createElement("input");
HIDDEN_VALIDATION_INPUT.type = "text";
HIDDEN_VALIDATION_INPUT.name = "dayWindowGuard";
HIDDEN_VALIDATION_INPUT.hidden = true;
HIDDEN_VALIDATION_INPUT.tabIndex = -1;
HIDDEN_VALIDATION_INPUT.setAttribute("aria-hidden", "true");
form.appendChild(HIDDEN_VALIDATION_INPUT);

const dayLabels = {
	mon: "Monday",
	tue: "Tuesday",
	wed: "Wednesday",
	thu: "Thursday",
	fri: "Friday",
	sat: "Saturday",
	sun: "Sunday",
};

const presetValues = {
	morning: { from: "08:00", to: "12:00" },
	noon: { from: "12:00", to: "17:00" },
	evening: { from: "17:30", to: "21:00" },
};

const state = {
	tags: [],
	electives: new Set(),
	timeBlocks: new Map(), // day -> { from, to }
};

function navigateToAdvisor() {
	window.location.replace("advisor.html");
}

function loadStoredSetup() {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        // if the stored payload explicitly requests a reset, clear it
        if (parsed && parsed.reset === true) {
            localStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return parsed;
    } catch (error) {
        console.warn("advisor:setup", "Unable to parse stored setup, clearing it", error);
        // corrupted data -> remove and treat as no stored setup
        localStorage.removeItem(STORAGE_KEY);
        return null;
    }
}

function resetStoredSetup() {
    localStorage.removeItem(STORAGE_KEY);
    console.info("advisor:setup", "Stored setup cleared");
}

function populateGradTerms() {
    if (!gradSelect) return;
    const now = new Date();
    const currentYear = now.getFullYear();
    const terms = ["spring", "summer", "fall"];
    const limitYears = currentYear + 5;
    const existing = new Set(Array.from(gradSelect.options).map((opt) => opt.value));
	for (let year = currentYear; year <= limitYears; year += 1) {
		for (const term of terms) {
			const value = `${term}-${year}`;
			if (existing.has(value)) continue;
			const opt = document.createElement("option");
			opt.value = value;
			opt.textContent = `${term.charAt(0).toUpperCase() + term.slice(1)} ${year}`;
			gradSelect.append(opt);
		}
	}
}

function renderTag(label) {
	const chip = document.createElement("span");
	chip.className = "tag-chip";
	chip.dataset.value = label;
	chip.textContent = label;
	const remove = document.createElement("button");
	remove.type = "button";
	remove.setAttribute("aria-label", `Remove ${label}`);
	remove.textContent = "×";
	remove.addEventListener("click", () => {
		state.tags = state.tags.filter((value) => value !== label);
		chip.remove();
	});
	chip.appendChild(remove);
	tagsContainer.insertBefore(chip, tagInput);
}

function addTag(label) {
	const cleaned = label.trim();
	if (!cleaned) return;
	if (state.tags.includes(cleaned)) return;
	state.tags.push(cleaned);
	renderTag(cleaned);
}

function hydrateTags(values = []) {
	state.tags = [];
	Array.from(tagsContainer.querySelectorAll(".tag-chip")).forEach((chip) => chip.remove());
	values.forEach(addTag);
}

function ensureTimeMessage() {
	const message = timeBlocksRoot.querySelector("p.field-description");
	if (!message) return;
	const hasRows = timeBlocksRoot.querySelector(".time-row");
	message.hidden = Boolean(hasRows);
}

function createTimeRow(day, block = { from: "09:00", to: "17:00" }) {
	const existing = timeBlocksRoot.querySelector(`.time-row[data-day="${day}"]`);
	if (existing) {
		const [fromInput, toInput] = existing.querySelectorAll("input[type=time]");
		if (fromInput && block.from) fromInput.value = block.from;
		if (toInput && block.to) toInput.value = block.to;
		state.timeBlocks.set(day, { ...block });
		return;
	}

	const row = document.createElement("div");
	row.className = "time-row";
	row.dataset.day = day;

	const title = document.createElement("span");
	title.textContent = dayLabels[day];
	row.append(title);

	const fromLabel = document.createElement("label");
	fromLabel.className = "sr-only";
	fromLabel.setAttribute("for", `from-${day}`);
	fromLabel.textContent = `${dayLabels[day]} start time`;
	row.append(fromLabel);

	const fromInput = document.createElement("input");
	fromInput.type = "time";
	fromInput.id = `from-${day}`;
	fromInput.value = block.from;
	fromInput.required = true;
	fromInput.addEventListener("change", () => {
		const current = state.timeBlocks.get(day) ?? {};
		state.timeBlocks.set(day, { ...current, from: fromInput.value });
	});
	row.append(fromInput);

	const toLabel = document.createElement("label");
	toLabel.className = "sr-only";
	toLabel.setAttribute("for", `to-${day}`);
	toLabel.textContent = `${dayLabels[day]} end time`;
	row.append(toLabel);

	const toInput = document.createElement("input");
	toInput.type = "time";
	toInput.id = `to-${day}`;
	toInput.value = block.to;
	toInput.required = true;
	toInput.addEventListener("change", () => {
		const current = state.timeBlocks.get(day) ?? {};
		state.timeBlocks.set(day, { ...current, to: toInput.value });
	});
	row.append(toInput);

	timeBlocksRoot.append(row);
	state.timeBlocks.set(day, { ...block });
	ensureTimeMessage();
}

function removeTimeRow(day) {
	const row = timeBlocksRoot.querySelector(`.time-row[data-day="${day}"]`);
	row?.remove();
	state.timeBlocks.delete(day);
	ensureTimeMessage();
}

function handleDayToggle(event) {
	const checkbox = event.target;
	const day = checkbox.value;
	if (checkbox.checked) {
		createTimeRow(day, state.timeBlocks.get(day));
	} else {
		removeTimeRow(day);
	}
}

function applyPreset(presetKey) {
	const preset = presetValues[presetKey];
	if (!preset) return;
	for (const day of state.timeBlocks.keys()) {
		createTimeRow(day, preset);
	}
}

function toggleElective(button) {
	const value = button.dataset.value;
	if (!value) return;
	if (state.electives.has(value)) {
		state.electives.delete(value);
		button.dataset.selected = "false";
	} else {
		state.electives.add(value);
		button.dataset.selected = "true";
	}
}

function hydrateElectives(values = []) {
	state.electives = new Set(values);
	electiveButtons.forEach((btn) => {
		const selected = state.electives.has(btn.dataset.value ?? "");
		btn.dataset.selected = selected ? "true" : "false";
	});
}

function hydrateDays(days = []) {
	const set = new Set(days);
	dayCheckboxes.forEach((checkbox) => {
		checkbox.checked = set.has(checkbox.value);
	});
	Array.from(state.timeBlocks.keys()).forEach((day) => removeTimeRow(day));
	set.forEach((day) => createTimeRow(day));
}

function hydrateTimeBlocks(blocks = {}) {
	Object.entries(blocks).forEach(([day, entries]) => {
		if (!Array.isArray(entries) || !entries.length) return;
		const block = entries[0];
		createTimeRow(day, block);
	});
}

function hydrateFields(payload) {
	if (!payload) return;
	try {
		const { student } = payload;
		if (!student) return;
		hydrateTags(student.interests ?? []);
		if (typeof student.credits === "number") {
			creditsInput.value = String(student.credits);
		}
		hydrateElectives(student.electives ?? []);
		hydrateDays(student.preferredDays ?? []);
		hydrateTimeBlocks(student.timeBlocks ?? {});
		if (gradSelect && student.gradTerm) {
			gradSelect.value = student.gradTerm;
		}
	} catch (error) {
		console.warn("advisor:setup", "Failed to hydrate fields", error);
	}
}

function gatherTimeBlocks(selectedDays) {
	const result = {};
	let valid = true;
	selectedDays.forEach((day) => {
		const row = timeBlocksRoot.querySelector(`.time-row[data-day="${day}"]`);
		const [fromInput, toInput] = row ? Array.from(row.querySelectorAll("input[type=time]")) : [];
		const from = fromInput?.value ?? "";
		const to = toInput?.value ?? "";
		if (!from || !to) {
			valid = false;
			return;
		}
		if (from >= to) {
			valid = false;
			toInput?.setCustomValidity("End time must be after start time");
			toInput?.reportValidity();
		} else {
			toInput?.setCustomValidity("");
		}
		result[day] = [{ from, to }];
	});
	return { result, valid };
}

function validateStage(index) {
	if (!isSetupPage) return true;
	switch (index) {
		case 0: {
			if (!creditsInput) return true;
			return creditsInput.reportValidity();
		}
		case 1: {
			const selectedDays = dayCheckboxes.filter((cb) => cb.checked).map((cb) => cb.value);
			if (!selectedDays.length) {
				HIDDEN_VALIDATION_INPUT.value = "";
				HIDDEN_VALIDATION_INPUT.setCustomValidity("Select at least one preferred day to continue.");
				HIDDEN_VALIDATION_INPUT.reportValidity();
				return false;
			}
			HIDDEN_VALIDATION_INPUT.setCustomValidity("");
			HIDDEN_VALIDATION_INPUT.value = "ok";
			const { valid } = gatherTimeBlocks(selectedDays);
			return valid;
		}
		default:
			return true;
	}
}

function gatherPayload() {
	const credits = Number.parseInt(creditsInput.value, 10);
	const selectedDays = dayCheckboxes.filter((cb) => cb.checked).map((cb) => cb.value);
	const { result: blocks, valid } = gatherTimeBlocks(selectedDays);
	const gradTerm = gradSelect?.value ?? "";

	const errors = [];
	if (!Number.isFinite(credits) || credits <= 0) {
		errors.push("Enter how many credits you plan to take.");
	}
	if (!selectedDays.length) {
		errors.push("Select at least one preferred day.");
	}
	if (!valid) {
		errors.push("Fix time ranges so that end times are after start times.");
	}
	if (!gradTerm) {
		errors.push("Choose an expected graduation term.");
	}

	if (errors.length) {
		HIDDEN_VALIDATION_INPUT.value = "";
		HIDDEN_VALIDATION_INPUT.setCustomValidity(errors.join(" \n"));
		HIDDEN_VALIDATION_INPUT.reportValidity();
		return null;
	}

	HIDDEN_VALIDATION_INPUT.value = "ok";
	HIDDEN_VALIDATION_INPUT.setCustomValidity("");

	return {
		student: {
			interests: [...state.tags],
			credits,
			preferredDays: selectedDays,
			timeBlocks: blocks,
			electives: Array.from(state.electives),
			gradTerm,
		},
		savedAt: new Date().toISOString(),
	};
}

function savePayload(payload) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function handleSubmit(event) {
	event.preventDefault();
	if (!form.reportValidity()) {
		return;
	}
	const payload = gatherPayload();
	if (!payload) return;
	savePayload(payload);
	if (page === "setup") {
		navigateToAdvisor();
	} else {
		announce("Preferences saved");
	}
}

function announce(message) {
	const status = document.createElement("div");
	status.className = "sr-only";
	status.setAttribute("role", "status");
	status.textContent = message;
	form.append(status);
	window.requestAnimationFrame(() => status.remove());
}

function resetDefaultsHandler() {
	const defaults = {
		student: {
			interests: ["CSE 3311", "Math Minor"],
			credits: 15,
			preferredDays: ["mon", "wed"],
			timeBlocks: {
				mon: [{ from: "09:00", to: "15:00" }],
				wed: [{ from: "09:00", to: "15:00" }],
			},
			electives: ["ai", "data"],
			gradTerm: gradSelect?.value || "fall-2026",
		},
	};
	hydrateFields(defaults);
	savePayload({ ...defaults, savedAt: new Date().toISOString() });
	announce("Defaults restored");
}

function initTagInput() {
	if (!tagInput) return;
	tagInput.addEventListener("keydown", (event) => {
		if (event.key === "Enter" || event.key === ",") {
			event.preventDefault();
			addTag(tagInput.value);
			tagInput.value = "";
		}
	});
	tagInput.addEventListener("blur", () => {
		if (tagInput.value.trim()) {
			addTag(tagInput.value);
			tagInput.value = "";
		}
	});
}

function initDays() {
	dayCheckboxes.forEach((checkbox) => {
		checkbox.addEventListener("change", handleDayToggle);
	});
}

function initPresets() {
	presetButtons.forEach((button) => {
		button.addEventListener("click", () => applyPreset(button.dataset.preset));
	});
}

function initElectives() {
	electiveButtons.forEach((btn) => {
		btn.dataset.selected = "false";
		btn.addEventListener("click", () => toggleElective(btn));
	});
}

function initFormFlow() {
	form.addEventListener("submit", handleSubmit);
	if (skipButton) {
		skipButton.addEventListener("click", navigateToAdvisor);
	}
	if (resetButton) {
		resetButton.addEventListener("click", resetDefaultsHandler);
	}
}

function updateStageIndicator() {
	if (!isSetupPage) return;
	const total = stages.length;
	const clamped = Math.max(0, Math.min(currentStageIndex, total - 1));
	stageDots.forEach((dot) => {
		const dotIndex = Number.parseInt(dot.dataset.stage ?? "0", 10);
		dot.dataset.active = dotIndex === clamped ? "true" : "false";
		dot.setAttribute("aria-current", dotIndex === clamped ? "step" : "false");
	});
	if (stageCurrentLabel) {
		stageCurrentLabel.textContent = String(clamped + 1);
	}
	if (stagePrevButton) {
		stagePrevButton.disabled = clamped === 0;
	}
	if (stageNextButton) {
		const isFinal = clamped === total - 1;
		stageNextButton.disabled = isFinal;
		stageNextButton.tabIndex = isFinal ? -1 : 0;
		stageNextButton.setAttribute("aria-hidden", isFinal ? "true" : "false");
		stageNextButton.dataset.inactive = isFinal ? "true" : "false";
	}
}

function setStage(index, options = {}) {
	if (!isSetupPage || !stages.length) return;
	const { silent = false } = options;
	const clamped = Math.max(0, Math.min(index, stages.length - 1));
	if (clamped === currentStageIndex && silent) {
		return;
	}
	stages.forEach((stage, idx) => {
		const active = idx === clamped;
		stage.dataset.active = active ? "true" : "false";
		stage.setAttribute("aria-hidden", active ? "false" : "true");
	});
	currentStageIndex = clamped;
	updateStageIndicator();
	if (!silent) {
		const focusTarget = stages[clamped]?.querySelector("input, select, textarea, [tabindex]:not([tabindex='-1'])");
		if (focusTarget) {
			window.requestAnimationFrame(() => focusTarget.focus());
		}
	}
}

function initStageFlow() {
	if (!isSetupPage || !stageContainer || !stages.length) return;
	setStage(0, { silent: true });
	updateStageIndicator();
	stagePrevButton?.addEventListener("click", () => {
		const destination = currentStageIndex - 1;
		if (destination >= 0) {
			setStage(destination);
		}
	});
	stageNextButton?.addEventListener("click", () => {
		if (!validateStage(currentStageIndex)) return;
		setStage(currentStageIndex + 1);
	});
	form.addEventListener("keydown", (event) => {
		if (event.key !== "Enter") return;
		const target = event.target;
		if (target && target.closest(".tag-input")) return;
		if (currentStageIndex >= stages.length - 1) return;
		event.preventDefault();
		if (!validateStage(currentStageIndex)) return;
		setStage(currentStageIndex + 1);
	});
}

function guardRouting() {
	if (page === "setup") {
		if (!localStorage.getItem(LOGGED_KEY)) {
			// user must go through sign in first
			window.location.replace("index.html");
			return false;
		}
		if (loadStoredSetup()) {
			navigateToAdvisor();
			return false;
		}
	}
	if (page === "settings") {
		const saved = loadStoredSetup();
		if (!saved) {
			window.location.replace("setup.html");
			return false;
		}
	}
	return true;
}

function init() {
	if (!form) return;
	populateGradTerms();
	initTagInput();
	initDays();
	initPresets();
	initElectives();
	initFormFlow();
	initStageFlow();

	const stored = loadStoredSetup();
	hydrateFields(stored);
}

if (guardRouting()) {
	init();
}
