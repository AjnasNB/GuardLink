ALTER TABLE communities ADD COLUMN joining_criteria TEXT NOT NULL DEFAULT 'Join with a wallet on Arc Testnet and request verification from the cooperative operator. After verification, contribute test USDC from the same wallet to activate coverage.';
ALTER TABLE membership_requests ADD COLUMN accepted_criteria TEXT;
