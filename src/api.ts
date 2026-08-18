import type { ChatResponse, MemoryItem, Metric, Overview, Role } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/$/, "");
const TOKEN_KEY = "private-ai-workbench-token";

export function getSavedToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token.trim());
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
    throw new Error(data.error || `请求失败 (${response.status})`);
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
  return data as { ok: boolean; provider?: string; model: string };
}

export const api = {
  health: () => request<{ ok: boolean; model: string }>("/api/health"),
  overview: () => request<Overview>("/api/overview"),
  chat: (message: string) =>
    request<ChatResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ message }),
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
  exportData: async () => {
    const data = await request<Record<string, unknown>>("/api/export");
    return data;
  },
};
