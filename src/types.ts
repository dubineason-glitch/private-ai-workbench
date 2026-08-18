export type Role = "media" | "health" | "daily" | "interior" | "journal";

export interface Entry {
  id: string;
  role: Role;
  title: string;
  user_text: string;
  assistant_text: string;
  summary: string;
  tags_json?: string;
  tags?: string[];
  health_signal: "none" | "caution" | "urgent";
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

export interface ChatResponse {
  entry: Entry;
  memories_added: number;
  metrics_added: number;
}

export interface Overview {
  counts: Record<Role, number>;
  memoryCounts: Record<Role, number>;
  recent: Entry[];
}
