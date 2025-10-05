const LOGIN_KEY = "loggedIn";
const SSO_DELAY_MS = 600;

function redirectToSetup() {
	window.location.replace("setup.html");
}

function alreadyLoggedIn() {
	return localStorage.getItem(LOGIN_KEY) === "1";
}

if (alreadyLoggedIn() && document.body.dataset.page === "landing") {
	redirectToSetup();
}

const ssoButton = document.getElementById("ssoButton");

function openMockWindow() {
    const doc = encodeURIComponent(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Mock Microsoft Login</title><style>body{font-family:Segoe UI,system-ui;background:#f3f2f1;color:#111;margin:0;display:grid;place-items:center;height:100vh;}main{border:1px solid #000;padding:32px;border-radius:18px;background:white;box-shadow:0 10px 32px rgba(0,0,0,0.12);}h1{margin-top:0;font-size:1.4rem;}p{margin:.5rem 0 0;color:#555;text-align:center;}</style><script>window.onload=function(){window.close();};</script></head><body><main><h1>Signing you in…</h1><p>This is a simulated Microsoft SSO popup.</p></main></body></html>`);
	return window.open(
		`data:text/html;charset=utf-8,${doc}`,
		"advise-mock-sso",
		"width=420,height=420,noopener=yes"
	);
}

function simulateLogin() {
	const popup = openMockWindow();
	window.setTimeout(() => {
		localStorage.setItem(LOGIN_KEY, "1");
		try {
			popup?.close();
		} catch (error) {
			console.warn("advisor:sso", "Unable to close popup", error);
		}
		redirectToSetup();
	}, SSO_DELAY_MS);
}

if (ssoButton) {
	ssoButton.addEventListener("click", simulateLogin);
}
