"""Additive SQLite schema for Digital Twin, Market Intelligence and Skill Exchange.

Executed by ``app.db.init_db`` after the core schema. Every statement is
idempotent (``IF NOT EXISTS``) so existing local databases migrate in place.
All user-owned rows carry ``user_id`` taken from the authenticated session,
never from request bodies.
"""

INTELLIGENCE_SCHEMA = """
-- ---------------------------------------------------------------- Digital Twin
CREATE TABLE IF NOT EXISTS twin_skills (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_key TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('claimed', 'demonstrated', 'verified')),
  proficiency INTEGER NOT NULL,
  confidence REAL NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  last_demonstrated_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, skill_key)
);

CREATE TABLE IF NOT EXISTS skill_evidence (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('claimed', 'demonstrated', 'verified')),
  strength REAL NOT NULL,
  excerpt TEXT,
  observed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, skill_key, source_type, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_skill_evidence_user ON skill_evidence(user_id, skill_key);

CREATE TABLE IF NOT EXISTS twin_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_twin_snapshots_user ON twin_snapshots(user_id, created_at DESC);

-- ----------------------------------------------------- Career Market Intelligence
-- owner_id NULL = shared market data (public feed); otherwise a private pasted JD.
CREATE TABLE IF NOT EXISTS market_postings (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  data_kind TEXT NOT NULL CHECK (data_kind IN ('live', 'platform', 'sample', 'user_provided')),
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT,
  location TEXT,
  url TEXT,
  published_at TEXT,
  retrieved_at TEXT NOT NULL,
  role_key TEXT,
  entry_level INTEGER NOT NULL DEFAULT 0,
  skills_json TEXT NOT NULL,
  UNIQUE (provider, external_id, owner_id)
);
CREATE INDEX IF NOT EXISTS idx_market_postings_role ON market_postings(role_key, retrieved_at DESC);

CREATE TABLE IF NOT EXISTS market_fetch_log (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  query TEXT NOT NULL,
  status TEXT NOT NULL,
  postings INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_fetch_log ON market_fetch_log(provider, query, fetched_at DESC);

-- ------------------------------------------------------------ Skill Exchange
CREATE TABLE IF NOT EXISTS exchange_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'hidden' CHECK (visibility IN ('hidden', 'members')),
  display_name TEXT NOT NULL,
  headline TEXT,
  teach_json TEXT NOT NULL DEFAULT '[]',
  learn_json TEXT NOT NULL DEFAULT '[]',
  tech_json TEXT NOT NULL DEFAULT '[]',
  interests_json TEXT NOT NULL DEFAULT '[]',
  roles_json TEXT NOT NULL DEFAULT '[]',
  availability TEXT,
  level TEXT NOT NULL DEFAULT 'beginner',
  show_evidence INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exchange_blocks (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, blocked_user_id)
);

CREATE TABLE IF NOT EXISTS exchange_reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('user', 'project')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL,
  UNIQUE (reporter_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS exchange_projects (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  roles_json TEXT NOT NULL DEFAULT '[]',
  skills_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'HIDDEN')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exchange_members (
  project_id TEXT NOT NULL REFERENCES exchange_projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  responsibility TEXT,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS exchange_requests (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('PROJECT_JOIN', 'PEER_CONNECT')),
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES exchange_projects(id) ON DELETE CASCADE,
  role TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN')),
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_exchange_requests_recipient ON exchange_requests(recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_exchange_requests_requester ON exchange_requests(requester_id, status);

CREATE TABLE IF NOT EXISTS exchange_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES exchange_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exchange_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES exchange_projects(id) ON DELETE CASCADE,
  milestone_id TEXT REFERENCES exchange_milestones(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  skills_json TEXT NOT NULL DEFAULT '[]',
  assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'DOING', 'DONE')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exchange_tasks_project ON exchange_tasks(project_id, status);

CREATE TABLE IF NOT EXISTS exchange_contributions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES exchange_projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES exchange_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  confirmed_by TEXT NOT NULL,
  skills_json TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (task_id, user_id)
);
"""
