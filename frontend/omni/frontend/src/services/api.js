import { supabase } from "../lib/supabase.js";

const BASE = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

/** Retrieve the active Supabase JWT, or null when auth is not configured. */
async function _bearerToken() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function request(path, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = await _bearerToken();
    const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
    const response = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json", ...authHeader, ...(options.headers || {}) },
      ...options, signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || data.detail || data.message || `HTTP ${response.status}`);
    return data;
  } finally { clearTimeout(timer); }
}

export async function runOmniSightScan(url, deep = true, onProgress = () => {}) {
  const viewports = deep
    ? [{width:390,height:844},{width:768,height:1024},{width:1440,height:900}]
    : [{width:390,height:844}];

  onProgress("Creating backend scan…", 0);
  const created = await request("/api/scans", {
    method:"POST", body:JSON.stringify({target_url:url, viewports})
  });
  const scanId = created.scan_id || created.id || created.scan?.id;
  if (!scanId) throw new Error("Backend did not return a scan ID.");

  onProgress("Playwright is opening the page and capturing evidence…", 0);
  const capture = await request(`/api/v1/scans/${encodeURIComponent(scanId)}/playwright-capture`, {
    method:"POST", body:JSON.stringify({url, viewports})
  }, 90000);
  if (!capture.evidence_count) throw new Error("Playwright did not save any evidence for VLM analysis.");
  if (capture.screenshot_url) capture.screenshot_url = BASE + capture.screenshot_url;
  if (Array.isArray(capture.screens)) {
    capture.screens = capture.screens.map(screen => ({
      ...screen,
      screenshot_url: screen.screenshot_url ? BASE + screen.screenshot_url : null
    }));
  }

  onProgress("Starting VLM detection…", 1);
  await request(`/api/v1/scans/${encodeURIComponent(scanId)}/detect`, {method:"POST"});

  let result = null;
  const maxPolls = 120;
  for (let i=0; i<maxPolls; i++) {
    onProgress(`Analysing ${capture.evidence_count} Playwright screenshot(s) with VLM…`, 1);
    result = await request(`/api/v1/scans/${encodeURIComponent(scanId)}/findings`);
    if (["detected","detection_failed","needs_inspection"].includes(result?.status)) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!result || !["detected","detection_failed","needs_inspection"].includes(result.status)) {
    throw new Error("VLM analysis is taking longer than expected. Check the backend scan status and logs.");
  }
  if (result.status === "detection_failed") {
    throw new Error(result?.detection?.reason_message || "VLM detection failed.");
  }
  let reasoning = null;
  let reasoningError = null;
  try {
    onProgress("Gemini is reasoning over validated VLM findings…", 2);
    reasoning = await request(
      `/api/v1/scans/${encodeURIComponent(scanId)}/reason`,
      {method:"POST"},
      90000
    );
  } catch (error) {
    // Keep the successful Playwright + VLM result visible even if Gemini is unavailable.
    reasoningError = error.message || "LLM reasoning could not be completed.";
  }
  return {scanId, capture, result, reasoning, reasoningError};
}

// ── Real production endpoint helpers ──────────────────────────────────────────

export const api = {
  projects: {
    list: () => request("/api/v1/projects"),
    create: (payload) => request("/api/v1/projects", { method: "POST", body: JSON.stringify(payload) }),
    get: (id) => request(`/api/v1/projects/${encodeURIComponent(id)}`),
  },
  scans: {
    list: () => request("/api/scans"),
    create: (payload) => request("/api/scans", { method: "POST", body: JSON.stringify(payload) }),
    get: (id) => request(`/api/scans/${encodeURIComponent(id)}`),
  },
  detection: {
    run: (scanId) => request(`/api/v1/scans/${encodeURIComponent(scanId)}/detect`, { method: "POST" }, 120000),
    findings: (scanId) => request(`/api/v1/scans/${encodeURIComponent(scanId)}/findings`),
  },
  repair: {
    run: (scanId) => request(`/api/v1/scans/${encodeURIComponent(scanId)}/repair`, { method: "POST" }, 300000),
    attempts: (scanId) => request(`/api/v1/scans/${encodeURIComponent(scanId)}/attempts`),
  },
  patches: {
    list: (findingId) => request(`/api/v1/findings/${encodeURIComponent(findingId)}/patch-proposals`),
    create: (findingId) => request(`/api/v1/findings/${encodeURIComponent(findingId)}/patch-proposals`, { method: "POST" }),
  },
  github: {
    publish: (scanId, payload = {}) => request(`/api/v1/scans/${encodeURIComponent(scanId)}/deliver`, { method: "POST", body: JSON.stringify(payload) }),
    status: (scanId) => request(`/api/v1/scans/${encodeURIComponent(scanId)}/pull-request`),
  },
  settings: {
    get: () => request("/api/v1/settings"),
    update: (payload) => request("/api/v1/settings", { method: "PATCH", body: JSON.stringify(payload) }),
  },
};
