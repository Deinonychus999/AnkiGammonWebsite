-- Download counts and thumbs votes for published decks (D1, bound as DB).
CREATE TABLE IF NOT EXISTS deck_stats (
  id TEXT PRIMARY KEY,
  downloads INTEGER NOT NULL DEFAULT 0,
  up INTEGER NOT NULL DEFAULT 0,
  down INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS votes (
  deck_id TEXT NOT NULL,
  voter TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  value INTEGER NOT NULL,
  voted_at TEXT NOT NULL,
  PRIMARY KEY (deck_id, voter)
);

CREATE INDEX IF NOT EXISTS votes_deck_ip ON votes (deck_id, ip_hash);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
