CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  title TEXT NOT NULL,
  user_text TEXT NOT NULL,
  assistant_text TEXT NOT NULL,
  summary TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  health_signal TEXT NOT NULL DEFAULT 'none',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entries_role_created
ON entries(role, created_at DESC);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_role_content
ON memories(role, content);

CREATE INDEX IF NOT EXISTS idx_memories_priority
ON memories(role, importance DESC, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_metrics_role_name_date
ON metrics(role, name, recorded_at DESC);
