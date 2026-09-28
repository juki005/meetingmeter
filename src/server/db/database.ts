import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const defaultDbDir = path.resolve(__dirname, '../../../data');
const dbPath = process.env.DATABASE_PATH || path.join(defaultDbDir, 'meetingmeter.sqlite');

// Ensure the directory containing the SQLite database exists
const targetDir = path.dirname(dbPath);
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

export const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// Initialize schema idempotently
const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schemaSql);

// Migration helper for v1.1 table upgrades
function applyMigrations() {
  // Check if meetings table needs check-constraint update for PREPARED status
  const tableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='meetings'").get() as any;
  if (tableSql && tableSql.sql && !tableSql.sql.includes('PREPARED')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE IF NOT EXISTS meetings_v11 (
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

      INSERT INTO meetings_v11 (
        id, user_id, title, status, provenance, currency, planned_date, planned_time, manual_reason,
        is_recurring, created_at, started_at, ended_at, accumulated_cost, participant_cost_total,
        external_cost_total, total_estimated_cost, unknown_cost_count, total_duration_seconds, updated_at
      )
      SELECT 
        id, user_id, title, 
        CASE WHEN status = 'CONFIGURED' THEN 'PREPARED' ELSE status END,
        'LIVE',
        COALESCE(currency, 'EUR'),
        NULL,
        NULL,
        NULL,
        0,
        created_at,
        started_at,
        ended_at,
        COALESCE(accumulated_cost, 0.0),
        COALESCE(accumulated_cost, 0.0),
        0.0,
        COALESCE(accumulated_cost, 0.0),
        COALESCE(unknown_cost_count, 0),
        COALESCE(total_duration_seconds, 0),
        COALESCE(updated_at, created_at)
      FROM meetings;

      DROP TABLE meetings;
      ALTER TABLE meetings_v11 RENAME TO meetings;
      CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings(user_id);
    `);
    db.pragma('foreign_keys = ON');
  }

  const meetingColumns = db.prepare("PRAGMA table_info(meetings)").all() as { name: string }[];
  const meetingColNames = new Set(meetingColumns.map(c => c.name));

  if (!meetingColNames.has('provenance')) {
    db.exec("ALTER TABLE meetings ADD COLUMN provenance TEXT NOT NULL DEFAULT 'LIVE'");
  }
  if (!meetingColNames.has('planned_date')) {
    db.exec("ALTER TABLE meetings ADD COLUMN planned_date TEXT");
  }
  if (!meetingColNames.has('planned_time')) {
    db.exec("ALTER TABLE meetings ADD COLUMN planned_time TEXT");
  }
  if (!meetingColNames.has('manual_reason')) {
    db.exec("ALTER TABLE meetings ADD COLUMN manual_reason TEXT");
  }
  if (!meetingColNames.has('is_recurring')) {
    db.exec("ALTER TABLE meetings ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0");
  }
  if (!meetingColNames.has('participant_cost_total')) {
    db.exec("ALTER TABLE meetings ADD COLUMN participant_cost_total REAL NOT NULL DEFAULT 0.0");
  }
  if (!meetingColNames.has('external_cost_total')) {
    db.exec("ALTER TABLE meetings ADD COLUMN external_cost_total REAL NOT NULL DEFAULT 0.0");
  }
  if (!meetingColNames.has('total_estimated_cost')) {
    db.exec("ALTER TABLE meetings ADD COLUMN total_estimated_cost REAL NOT NULL DEFAULT 0.0");
  }

  const participantColumns = db.prepare("PRAGMA table_info(meeting_participants)").all() as { name: string }[];
  const participantColNames = new Set(participantColumns.map(c => c.name));

  if (!participantColNames.has('manual_duration_seconds')) {
    db.exec("ALTER TABLE meeting_participants ADD COLUMN manual_duration_seconds INTEGER");
  }
}

applyMigrations();

export default db;
