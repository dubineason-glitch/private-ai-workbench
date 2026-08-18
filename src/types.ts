export type Role = "media" | "health" | "daily" | "interior" | "journal";
export type HealthSignal = "none" | "caution" | "urgent";
export type AIProvider = "workers-ai" | "openai-responses" | "openai-compatible";
export type EventCategory = "work" | "study" | "life" | "health" | "inspiration" | "other";
export type EventStatus = "pending" | "completed" | "deleted";

export interface Entry {
  id: string;
  role: Role;
  title: string;
  user_text: string;
  assistant_text: string;
  summary: string;
  tags_json?: string;
  tags?: string[];
  health_signal: HealthSignal;
  created_at: string;
}

export interface MemoryItem {
  id: string;
  role: Role;
  kind: string;
  content: string;
  importance: number;
  created_at: string;
  last_seen_at: string;
}

export interface Metric {
  id: string;
  role: Role;
  name: string;
  value: string;
  unit: string;
  note: string;
  recorded_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  note: string;
  start_at: string;
  end_at: string;
  all_day: number | boolean;
  category: EventCategory;
  status: EventStatus;
  source: "manual" | "ai" | string;
  timezone: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface CalendarEventInput {
  title: string;
  note?: string;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  category?: EventCategory;
  timezone?: string;
}

export interface CalendarActionResult {
  action: "create" | "complete" | "delete";
  ok: boolean;
  event?: CalendarEvent;
  message: string;
}

export interface ChatResponse {
  entry: Entry;
  memories_added: number;
  metrics_added: number;
  calendar_actions: CalendarActionResult[];
}

export interface Overview {
  counts: Record<Role, number>;
  memoryCounts: Record<Role, number>;
  recent: Entry[];
  latestMetrics: Metric[];
}

export interface HealthResponse {
  ok: boolean;
  provider: AIProvider;
  model: string;
  configured: boolean;
}

export interface AISettings {
  provider: AIProvider;
  base_url: string;
  model: string;
  has_api_key: boolean;
  updated_at?: string;
}

export interface AISavePayload {
  provider: AIProvider;
  base_url: string;
  model: string;
  api_key?: string;
  clear_api_key?: boolean;
}

export interface AITestResult {
  ok: boolean;
  provider: AIProvider;
  model: string;
  message: string;
}
