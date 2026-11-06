CREATE TABLE IF NOT EXISTS governance_proposals (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  creation_tx TEXT NOT NULL,
  block_number INTEGER NOT NULL
);
