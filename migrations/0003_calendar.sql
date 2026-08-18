CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  category TEXT NOT NULL DEFAULT 'life',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'deleted')),
  source TEXT NOT NULL DEFAULT 'manual',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_range
ON calendar_events(start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_calendar_events_status_start
ON calendar_events(status, start_at);

CREATE INDEX IF NOT EXISTS idx_calendar_events_category_start
ON calendar_events(category, start_at);
