CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  job_title TEXT,
  hourly_rate REAL NOT NULL DEFAULT 0.0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('internal', 'guest')),
  name TEXT NOT NULL,
  role TEXT,
  organization TEXT,
  hourly_rate REAL,
  rate_known INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cost_library_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_amount REAL NOT NULL DEFAULT 0.0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PREPARED', 'CONFIGURED', 'LIVE', 'ENDED')) DEFAULT 'PREPARED',
  provenance TEXT NOT NULL CHECK(provenance IN ('LIVE', 'MANUAL_ENTRY')) DEFAULT 'LIVE',
  currency TEXT NOT NULL DEFAULT 'EUR',
  planned_date TEXT,
  planned_time TEXT,
  manual_reason TEXT,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  accumulated_cost REAL NOT NULL DEFAULT 0.0,
  participant_cost_total REAL NOT NULL DEFAULT 0.0,
  external_cost_total REAL NOT NULL DEFAULT 0.0,
  total_estimated_cost REAL NOT NULL DEFAULT 0.0,
  unknown_cost_count INTEGER NOT NULL DEFAULT 0,
  total_duration_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meeting_external_costs (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  cost_library_id TEXT REFERENCES cost_library_items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0.0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  is_overridden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meeting_participants (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  person_id TEXT,
  name TEXT NOT NULL,
  role TEXT,
  organization TEXT,
  is_guest INTEGER NOT NULL DEFAULT 0,
  hourly_rate_snapshot REAL,
  rate_known INTEGER NOT NULL DEFAULT 1,
  state TEXT NOT NULL CHECK(state IN ('ACTIVE', 'PAUSED', 'LEFT')) DEFAULT 'ACTIVE',
  selected INTEGER NOT NULL DEFAULT 1,
  measured_seconds INTEGER NOT NULL DEFAULT 0,
  manual_duration_seconds INTEGER,
  calculated_cost REAL,
  left_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS measurement_intervals (
  id TEXT PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES meeting_participants(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_people_user ON people(user_id);
CREATE INDEX IF NOT EXISTS idx_cost_library_user ON cost_library_items(user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_costs_meeting ON meeting_external_costs(meeting_id);
CREATE INDEX IF NOT EXISTS idx_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_intervals_participant ON measurement_intervals(participant_id);
CREATE INDEX IF NOT EXISTS idx_intervals_meeting ON measurement_intervals(meeting_id);
