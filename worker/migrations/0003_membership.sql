CREATE TABLE IF NOT EXISTS membership_requests(member_id TEXT PRIMARY KEY,community_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'requested',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_handoffs(token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
