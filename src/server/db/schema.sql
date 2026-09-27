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

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('CONFIGURED', 'LIVE', 'ENDED')) DEFAULT 'CONFIGURED',
  currency TEXT NOT NULL DEFAULT 'EUR',
  created_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT,
  accumulated_cost REAL NOT NULL DEFAULT 0.0,
  unknown_cost_count INTEGER NOT NULL DEFAULT 0,
  total_duration_seconds INTEGER NOT NULL DEFAULT 0,
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
CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings(user_id);
CREATE INDEX IF NOT EXISTS idx_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_intervals_participant ON measurement_intervals(participant_id);
CREATE INDEX IF NOT EXISTS idx_intervals_meeting ON measurement_intervals(meeting_id);
