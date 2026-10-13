-- Profiles, cards and the flagged-account check look players up by wallet.
CREATE INDEX users_wallet_idx ON users (wallet);
