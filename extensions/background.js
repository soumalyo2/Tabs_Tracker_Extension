/**
 * Global Asynchronous Browser Lifecycle Event Listener
 * Monitors navigation events, filters system tabs, and pushes completed page visits
 * to the local Flask Session Rolling backend.
 */


const BACKEND_URL = "http://127.0.0.1:5000/api/track";


const IGNORED_SCHEMES = [
  "chrome://",
  "chrome-extension://",
  "chrome-search://",
  "chrome-untrusted://",
  "edge://",
  "about:",
  "devtools://",
  "view-source:",
  "data:",
  "blob:",
  "javascript:"
];

/**
 * Validates if the given URL is a legitimate, trackable web page.
 * @param {string} url 
 * @returns {boolean}
 */
function isValidWebUrl(url) {
  if (!url || typeof url !== "string") return false;
  
  // Must be standard HTTP or HTTPS
  const isHttpOrHttps = url.startsWith("http://") || url.startsWith("https://");
  if (!isHttpOrHttps) return false;

  // Ensure no internal schemes slipped through
  for (const scheme of IGNORED_SCHEMES) {
    if (url.startsWith(scheme)) return false;
  }

  return true;
}

/**
 * Sends tab telemetry payload to local Flask backend.
 * @param {object} payload 
 */
async function sendTabTelemetry(payload) {
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.warn(`[Tab Tracker] Backend rejected tab telemetry with status: ${response.status}`);
      return;
    }

    const data = await response.json();
    console.log(`[Tab Tracker] Successfully recorded tab in session: ${data.session_id}`);
  } catch (err) {
    // Gracefully handle backend offline state (e.g. Flask server not started yet)
    console.warn("[Tab Tracker] Backend server unreachable at http://127.0.0.1:5000. Tab tracking delayed.");
  }
}

// Global Chrome Lifecycle Event Listener
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") {
    return;
  }

  const targetUrl = tab.url || changeInfo.url;
  if (!isValidWebUrl(targetUrl)) {
    return;
  }

  const payload = {
    url: targetUrl,
    title: tab.title || targetUrl,
    
    fav_icon_url: tab.favIconUrl || ""
  };

  await sendTabTelemetry(payload);
});

console.log("[Tab Tracker Service Worker] Lifecycle listener initialized.");