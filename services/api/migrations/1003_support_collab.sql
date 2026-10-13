-- Collaboration requests arrive through the support form (/collab, docs/05 §4.8).
ALTER TABLE support_tickets DROP CONSTRAINT support_tickets_topic_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_topic_check
  CHECK (topic IN ('account', 'transaction', 'bug', 'safety', 'collab', 'other'));
