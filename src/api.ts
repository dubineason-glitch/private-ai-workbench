import type {
  AISavePayload,
  AISettings,
  AITestResult,
  CalendarEvent,
  CalendarEventInput,
  ChatResponse,
  HealthResponse,
  MemoryItem,
  Metric,
  Overview,
  Role,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const TOKEN_KEY = "private-ai-workbench-token";
const TOKEN_EXPIRY_KEY = "private-ai-workbench-token-expires-at";
const LOGIN_DAYS = 30;

export function getSavedToken() {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || "0");
  if (!token) return "";
  if (Number.isFinite(expiry) && expiry > 0 && Date.now() >= expiry) {
    clearSavedToken();
    return "";
  }
  return token;
}

export function getTokenExpiry() {
  const expiry = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || "0");
  return Number.isFinite(expiry) ? expiry : 0;
}

export function saveToken(token: string, days = LOGIN_DAYS) {
  const clean = token.trim();
  if (!clean) {
    clearSavedToken();
    return;
  }
  localStorage.setItem(TOKEN_KEY, clean);
  localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + days * 86400000));
}

export function clearSavedToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
}

export function isNativeShell() {
  return Boolean((window as typeof window & { __PRIVATE_AI_SHELL__?: unknown }).__PRIVATE_AI_SHELL__);
}

export function openNativeShellSettings() {
  window.location.href = "workbench://shell-settings";
}

function headers() {
  return {
    "Content-Type": "application/json",
    "x-workbench-token": getSavedToken(),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...headers(),
      ...(init.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data?.error === "string" ? data.error : `请求失败 (${response.status})`;
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data as T;
}

export async function verifyToken(token: string) {
  const cleanToken = token.trim();
  if (!cleanToken) throw new Error("请输入访问口令");
  const response = await fetch(`${API_BASE}/api/health`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-workbench-token": cleanToken,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `验证失败 (${response.status})`);
  return data as HealthResponse;
}

function eventPath(id: string, suffix = "") {
  return `/api/events/${encodeURIComponent(id)}${suffix}`;
}

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  overview: () => request<Overview>("/api/overview"),
  chat: (message: string) =>
    request<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        now: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      }),
    }),
  history: (role?: Role) =>
    request<{ entries: import("./types").Entry[] }>(
      `/api/history${role ? `?role=${role}` : ""}`,
    ),
  memories: (role?: Role) =>
    request<{ memories: MemoryItem[] }>(
      `/api/memories${role ? `?role=${role}` : ""}`,
    ),
  metrics: (role?: Role) =>
    request<{ metrics: Metric[] }>(
      `/api/metrics${role ? `?role=${role}` : ""}`,
    ),
  events: (start: string, end: string) =>
    request<{ events: CalendarEvent[] }>(
      `/api/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    ),
  createEvent: (payload: CalendarEventInput) =>
    request<{ event: CalendarEvent }>("/api/events", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateEvent: (id: string, payload: CalendarEventInput) =>
    request<{ event: CalendarEvent }>(eventPath(id), {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteEvent: (id: string) =>
    request<{ event: CalendarEvent }>(eventPath(id), { method: "DELETE" }),
  restoreEvent: (id: string) =>
    request<{ event: CalendarEvent }>(eventPath(id, "/restore"), { method: "POST" }),
  completeEvent: (id: string) =>
    request<{ event: CalendarEvent }>(eventPath(id, "/complete"), { method: "POST" }),
  reopenEvent: (id: string) =>
    request<{ event: CalendarEvent }>(eventPath(id, "/reopen"), { method: "POST" }),
  aiSettings: () => request<AISettings>("/api/settings/ai"),
  saveAISettings: (payload: AISavePayload) =>
    request<AISettings>("/api/settings/ai", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  testAISettings: (payload: AISavePayload) =>
    request<AITestResult>("/api/settings/ai/test", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  exportData: () => request<Record<string, unknown>>("/api/export"),
};
