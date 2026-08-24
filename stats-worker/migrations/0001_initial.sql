PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS practice_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  code TEXT NOT NULL UNIQUE CHECK (length(code) = 6),
  is_open INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES practice_groups(id) ON DELETE CASCADE,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 0 AND 3600),
  score INTEGER NOT NULL CHECK (score >= 0),
  total INTEGER NOT NULL CHECK (total BETWEEN 1 AND 30 AND score <= total)
);

CREATE TABLE IF NOT EXISTS attempt_results (
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL CHECK (length(question_id) BETWEEN 1 AND 80),
  category TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 50),
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  PRIMARY KEY (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_attempts_group_submitted
ON attempts(group_id, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_attempt_results_attempt_category
ON attempt_results(attempt_id, category);

PRAGMA optimize;
