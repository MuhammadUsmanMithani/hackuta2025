const THEME_KEY = "theme";
const themeStatus = document.getElementById("themeStatus");
const toggleButton = document.getElementById("themeToggle");
const toggleIcon = document.getElementById("themeToggleIcon");
let toggleAnimationTimer = null;

const prefersDark = typeof window.matchMedia === "function"
	? window.matchMedia("(prefers-color-scheme: dark)")
	: null;

function readStoredTheme() {
	return localStorage.getItem(THEME_KEY);
}

function resolveTheme() {
	const stored = readStoredTheme();
	if (stored === "light" || stored === "dark") {
		return stored;
	}
	return prefersDark?.matches ? "dark" : "light";
}

function updateIcon(theme) {
	if (!toggleIcon) return;
	toggleIcon.textContent = theme === "dark" ? "🌙" : "🌞";
}

function animateToggleIcon() {
 if (!toggleButton) return;
 toggleButton.classList.add("theme-toggle--animating");
 if (toggleAnimationTimer) {
  clearTimeout(toggleAnimationTimer);
 }
 toggleAnimationTimer = window.setTimeout(() => {
  toggleButton.classList.remove("theme-toggle--animating");
  toggleAnimationTimer = null;
 }, 280);
}

function announce(message) {
	if (!themeStatus) return;
	themeStatus.textContent = "";
	window.requestAnimationFrame(() => {
		themeStatus.textContent = message;
	});
}

function applyTheme(theme, { silent = false } = {}) {
	document.documentElement.dataset.theme = theme;
	updateIcon(theme);
 if (!silent) {
  animateToggleIcon();
 }
	if (!silent) {
		announce(`Theme switched to ${theme}`);
	}
}

function toggleTheme() {
	const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
	localStorage.setItem(THEME_KEY, next);
	applyTheme(next);
}

function onSystemThemeChange(event) {
	if (readStoredTheme()) return; // keep user preference
	applyTheme(event.matches ? "dark" : "light", { silent: true });
}

const initialTheme = resolveTheme();
applyTheme(initialTheme, { silent: true });

if (prefersDark?.addEventListener) {
	prefersDark.addEventListener("change", onSystemThemeChange);
}

if (toggleButton) {
	toggleButton.addEventListener("click", toggleTheme);
}
