-- OpenZeppelin's TimelockController emits CallSalt(id, salt) for a non-zero salt. Executing an
-- operation needs its salt, so the operator panel can rebuild the execute call from the index.
ALTER TABLE timelock_ops ADD COLUMN salt text;
