export const SCHEMA = `
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  organization TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '👤',
  version TEXT NOT NULL DEFAULT '1.0.0',
  responsibilities TEXT NOT NULL DEFAULT '[]',
  decision_powers TEXT NOT NULL DEFAULT '[]',
  expertise TEXT NOT NULL DEFAULT '[]',
  personality TEXT NOT NULL DEFAULT '[]',
  concerns TEXT NOT NULL DEFAULT '[]',
  history TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  description TEXT DEFAULT '',
  phase TEXT NOT NULL DEFAULT 'design',
  participant_ids TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'created',
  priority TEXT DEFAULT 'medium',
  prd_section TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role_id TEXT,
  role_name TEXT,
  role_avatar TEXT,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  phase TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS document_cache (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  screened_sections TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evolution_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT DEFAULT '',
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type);
CREATE INDEX IF NOT EXISTS idx_sessions_phase ON sessions(phase);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_evolution_type ON evolution_log(event_type);
CREATE INDEX IF NOT EXISTS idx_evolution_entity ON evolution_log(entity_id);
`;
